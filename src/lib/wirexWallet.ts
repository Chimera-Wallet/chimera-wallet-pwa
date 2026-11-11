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

const WIREX_CONFIG_URL = '/api/wirex-config'

/**
 * The company id the SDK registers this wallet under on-chain (Accounts
 * contract `createUserAccountWithWallet(companyId)` / `getUserAccount`).
 * Read from `/api/wirex-config`'s `defaultCompanyId`, which our backend
 * overwrites with the partner's own company id (from the partner token — see
 * api/wirex/config.ts). It must be the partner's company: Wirex's
 * POST /api/v2/user rejects wallets registered under any other.
 */
const getWirexCompanyId = async (): Promise<string> => {
  const res = await fetch(WIREX_CONFIG_URL, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Failed to load Wirex config: ${res.status}`)
  const config = (await res.json().catch(() => ({}))) as { defaultCompanyId?: unknown }
  if (typeof config.defaultCompanyId !== 'string' || config.defaultCompanyId === '') {
    throw new Error('Wirex config did not include a defaultCompanyId')
  }
  return toBytes16CompanyId(config.defaultCompanyId)
}

export const toBytes16CompanyId = (companyId: string): `0x${string}` => {
  const hex = companyId.trim().replace(/^0x/i, '').replace(/-/g, '').toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error(`Invalid Wirex company id: ${companyId}`)
  return `0x${hex}`
}

export interface WirexKernelAccountDeployment {
  walletAddress: `0x${string}`
  /** Hash of the onboarding or Accounts-registration UserOperation's tx; null when no registration was needed this call. */
  transactionHash: Hex | null
}


type WirexSdk = Awaited<ReturnType<typeof createSDK>>

export const getWirexSdk = async (password: string): Promise<WirexSdk> => (await buildWirexSdk(password)).sdk

const buildWirexSdk = async (password: string) => {
  const account = await deriveEthAccount(password)

  const env = getWirexSdkEnv()
  const companyId = await getWirexCompanyId()

  const sdk = await createSDK({
    env,
    companyId,
    // Wirex's own RPC nodes (e.g. node-base.wirexapp.tech) send no CORS
    // headers for our origin, so the SDK's on-chain reads fail if it fetches
    // its remote config directly. Route that fetch (and the RPC calls it
    // configures) through our backend instead — see api/wirex/config.ts and
    // api/wirex/rpcProxy.ts.
    configUrl: WIREX_CONFIG_URL,
    getMainWalletClient: () => ({
      address: account.address,
      getEthereumProvider: async () => buildEip1193Provider(account),
    }),
  })
  return { sdk, account, companyId }
}

export const deployWirexKernelAccount = async (password: string): Promise<WirexKernelAccountDeployment> => {
  const { sdk, account, companyId } = await buildWirexSdk(password)

  const walletAddress = await sdk.crypto.wallet.getSmartWalletAddress()
  const [isPolicyInstalled, isExecutorInstalled] = await Promise.all([
    sdk.crypto.accountAbstraction.isPolicyInstalled(),
    sdk.crypto.accountAbstraction.isExecutorInstalled(),
  ])

  let transactionHash: Hex | null = null

  if (!isPolicyInstalled && !isExecutorInstalled) {
    const receipt = await sdk.crypto.onboarding.allInOneStepOnboarding()
    transactionHash = receipt.receipt.transactionHash
  } else {
    // A prior attempt got partway through — finish whatever steps remain
    // rather than re-running allInOneStepOnboarding (which assumes neither
    // step is installed yet).
    if (!isExecutorInstalled) await sdk.crypto.accountAbstraction.signInExecutor()
    if (!isPolicyInstalled) await sdk.crypto.accountAbstraction.signInPolicy()
    if (!(await sdk.crypto.accountContract.isWalletInAccounts())) {
      // The SDK only checks that *a* receipt came back, not that the
      // UserOperation succeeded, so a reverted registration would otherwise
      // pass silently.
      const receipt = await sdk.crypto.accountContract.registerInAccounts()
      if (receipt && receipt.success === false) {
        throw new Error(
          `Wirex Accounts registration UserOperation failed: tx=${receipt.receipt?.transactionHash}, reason=${receipt.reason ?? 'unknown'}`,
        )
      }
      transactionHash = receipt?.receipt?.transactionHash ?? null
    }
  }

  // Wirex's POST /api/v2/user rejects a wallet that isn't registered in the
  // Accounts contract under the partner's company id, so confirm that here
  // rather than letting user creation fail later with a less obvious error.
  if (!(await sdk.crypto.accountContract.isWalletInAccounts())) {
    throw new Error(`Wallet ${account.address} is not registered in the Wirex Accounts contract for company ${companyId}`)
  }

  return { walletAddress, transactionHash }
}

/** Wirex's unified-balance USD token; unwraps to its base token (USDC) on withdrawal. */
export const WIREX_WUSD_SYMBOL = 'WUSD'

export interface WirexWithdrawParams {
  /** Base-chain address that receives the unwrapped base token. */
  recipient: `0x${string}`
  /** Decimal amount of WUSD to withdraw (e.g. 10.5). */
  amount: number
  /** Synthetic token to withdraw; defaults to WUSD. */
  symbol?: string
}

export interface WirexWithdrawResult {
  txHash: Hex
  /** What actually arrives at the recipient (the synthetic's base token). */
  baseToken: { symbol: string; address: `0x${string}`; decimals: number }
}

/**
 * Move unified balance out of the Wirex smart wallet: unwrap WUSD to its base
 * token and transfer it to `recipient`, in one call.
 *
 * Outflows are time-locked by Wirex's Execution Delay Policy: the SDK submits
 * `request(...)`, waits until it is due, then executes. This promise stays
 * pending for that whole delay. Gas is paid by Wirex's paymaster.
 */
export const withdrawFromWirexWallet = async (
  password: string,
  { recipient, amount, symbol = WIREX_WUSD_SYMBOL }: WirexWithdrawParams,
): Promise<WirexWithdrawResult> => {
  if (!(amount > 0)) throw new Error('Amount must be greater than zero')
  const sdk = await getWirexSdk(password)
  const token = sdk.crypto.getToken(symbol)
  if (!token) throw new Error(`${symbol} is not in Wirex's token registry`)
  if (!token.isSynthetic || !token.baseToken) throw new Error(`${symbol} has no base token to withdraw to`)
  const txHash = await sdk.crypto.transfer.makeErc20TransferFull({
    tokenAddress: token.address,
    recipientAddress: recipient,
    amount,
  })
  const { symbol: baseSymbol, address, decimals } = token.baseToken
  return { txHash, baseToken: { symbol: baseSymbol, address, decimals } }
}

/**
 * Execute a withdrawal requested earlier (e.g. by a closed tab) once its
 * Execution Delay Policy delay has passed. `callData` is the request's
 * `call_data` from GET /api/v1/withdrawal/requests (hex, with or without 0x).
 */
export const finishWirexWithdrawal = async (password: string, callData: string): Promise<Hex> => {
  const sdk = await getWirexSdk(password)
  // The SDK prefixes 0x itself.
  return (await sdk.crypto.transfer.makeErc20TransferFinal(callData.replace(/^0x/i, ''))) as unknown as Hex
}
