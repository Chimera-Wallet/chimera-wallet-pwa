/**
 * Wirex self-custodial (account-abstraction) wallet — EVM signer derivation,
 * plus on-chain kernel-account deployment via Wirex's own `@wirexapp/wpay-baas-sdk`.
 *
 * Signer: derived from this wallet's EXISTING mnemonic (see ./mnemonic.ts) at
 * the standard Ethereum path m/44'/60'/0'/0/0, rather than generating and
 * storing a second seed. A user who has already backed up their Arkade
 * mnemonic (src/providers/backup.tsx) thereby also backs up whatever secures
 * their Wirex EVM wallet.
 */

import { HDKey } from '@scure/bip32'
import { mnemonicToSeedSync } from '@scure/bip39'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'
import type { Hex } from 'viem'
import { createSDK, type SDKEnvironment } from '@wirexapp/wpay-baas-sdk'
import { getMnemonic } from './mnemonic'

const ETH_DERIVATION_PATH = "m/44'/60'/0'/0/0"

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

// EIP-55 mixed-case checksum encoding.
const toChecksumAddress = (addressHexNoPrefix: string): string => {
  const address = addressHexNoPrefix.toLowerCase()
  const hashHex = bytesToHex(keccak_256(new TextEncoder().encode(address)))
  let checksummed = '0x'
  for (let i = 0; i < address.length; i++) {
    checksummed += parseInt(hashHex[i], 16) >= 8 ? address[i].toUpperCase() : address[i]
  }
  return checksummed
}

const deriveEthKeyNode = async (password: string): Promise<HDKey> => {
  const mnemonic = await getMnemonic(password)
  const seed = mnemonicToSeedSync(mnemonic)
  const node = HDKey.fromMasterSeed(seed).derive(ETH_DERIVATION_PATH)
  if (!node.privateKey) throw new Error('BIP32 derivation yielded no private key')
  return node
}

const deriveEthAccount = async (password: string): Promise<PrivateKeyAccount> => {
  const node = await deriveEthKeyNode(password)
  return privateKeyToAccount(`0x${bytesToHex(node.privateKey as Uint8Array)}` as Hex)
}

/** The Eth address for this wallet's Wirex signer does not expose the private key. */
export const getWirexEvmAddress = async (password: string): Promise<string> => {
  const node = await deriveEthKeyNode(password)
  // Uncompressed public key (65 bytes: 0x04 prefix + 32-byte X + 32-byte Y).
  const uncompressedPubKey = secp256k1.getPublicKey(node.privateKey as Uint8Array, false)
  const addressBytes = keccak_256(uncompressedPubKey.slice(1)).slice(-20)
  return toChecksumAddress(bytesToHex(addressBytes))
}

const buildEip1193Provider = (account: PrivateKeyAccount) => ({
  request: async ({ method, params }: { method: string; params?: unknown[] }): Promise<unknown> => {
    switch (method) {
      case 'eth_requestAccounts':
      case 'eth_accounts':
        return [account.address]
      case 'eth_sign':
      case 'personal_sign': {
        const [data] = params as [Hex]
        return account.signMessage({ message: { raw: data } })
      }
      case 'eth_signTypedData_v4': {
        const [, typedDataJson] = params as [string, string]
        return account.signTypedData(JSON.parse(typedDataJson))
      }
      default:
        throw new Error(`Wirex EVM signer does not support RPC method: ${method}`)
    }
  },
})

const getWirexSdkEnv = (): SDKEnvironment => {
  const env = import.meta.env.VITE_WIREX_SDK_ENV
  if (env !== 'dev' && env !== 'uat' && env !== 'prod') {
    throw new Error(`Missing or invalid VITE_WIREX_SDK_ENV (must be 'dev', 'uat' or 'prod'), got: ${env}`)
  }
  return env
}

const getWirexCompanyId = (): string => {
  const companyId = import.meta.env.VITE_WIREX_COMPANY_ID
  if (!companyId) throw new Error('Missing VITE_WIREX_COMPANY_ID configuration')
  return companyId
}

export interface WirexKernelAccountDeployment {
  walletAddress: `0x${string}`
  /** null when this call only finished already-in-progress steps rather than submitting a new UserOperation. */
  transactionHash: Hex | null
}


export const deployWirexKernelAccount = async (password: string): Promise<WirexKernelAccountDeployment> => {
  const account = await deriveEthAccount(password)

  const sdk = await createSDK({
    env: getWirexSdkEnv(),
    companyId: getWirexCompanyId(),
    getMainWalletClient: () => ({
      address: account.address,
      getEthereumProvider: async () => buildEip1193Provider(account),
    }),
  })

  const walletAddress = await sdk.crypto.wallet.getSmartWalletAddress()
  const [isPolicyInstalled, isExecutorInstalled] = await Promise.all([
    sdk.crypto.accountAbstraction.isPolicyInstalled(),
    sdk.crypto.accountAbstraction.isExecutorInstalled(),
  ])

  if (!isPolicyInstalled && !isExecutorInstalled) {
    const receipt = await sdk.crypto.onboarding.allInOneStepOnboarding()
    return { walletAddress, transactionHash: receipt.receipt.transactionHash }
  }

  // A prior attempt got partway through — finish whatever steps remain
  // rather than re-running allInOneStepOnboarding (which assumes neither
  // step is installed yet).
  if (!isExecutorInstalled) await sdk.crypto.accountAbstraction.signInExecutor()
  if (!isPolicyInstalled) await sdk.crypto.accountAbstraction.signInPolicy()
  if (!(await sdk.crypto.accountContract.isWalletInAccounts())) {
    await sdk.crypto.accountContract.registerInAccounts()
  }

  return { walletAddress, transactionHash: null }
}
