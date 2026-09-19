import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { setMnemonic } from '../../lib/mnemonic'
import { getWirexEvmAddress, deployWirexKernelAccount } from '../../lib/wirexWallet'
import { createSDK } from '@wirexapp/wpay-baas-sdk'

vi.mock('@wirexapp/wpay-baas-sdk', () => ({
  createSDK: vi.fn(),
}))

const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const otherMnemonic = 'legal winner thank year wave sausage worth useful legal winner thank yellow'
const testPassword = 'testpassword'

// Minimal stand-in for the subset of the SDK's surface deployWirexKernelAccount
// actually calls, with every step defaulting to "already done" so a test only
// has to override the specific step(s) it cares about.
const makeSdk = (overrides: {
  isPolicyInstalled?: boolean
  isExecutorInstalled?: boolean
  isWalletInAccounts?: boolean
  walletAddress?: string
  transactionHash?: string
} = {}) => ({
  crypto: {
    wallet: {
      getSmartWalletAddress: vi.fn().mockResolvedValue(overrides.walletAddress ?? '0xSmartWallet'),
    },
    accountAbstraction: {
      isPolicyInstalled: vi.fn().mockResolvedValue(overrides.isPolicyInstalled ?? true),
      isExecutorInstalled: vi.fn().mockResolvedValue(overrides.isExecutorInstalled ?? true),
      signInExecutor: vi.fn().mockResolvedValue(undefined),
      signInPolicy: vi.fn().mockResolvedValue(undefined),
    },
    onboarding: {
      allInOneStepOnboarding: vi
        .fn()
        .mockResolvedValue({ receipt: { transactionHash: overrides.transactionHash ?? '0xTxHash' } }),
    },
    accountContract: {
      isWalletInAccounts: vi.fn().mockResolvedValue(overrides.isWalletInAccounts ?? true),
      registerInAccounts: vi.fn().mockResolvedValue(undefined),
    },
  },
})

describe('wirexWallet.ts', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('getWirexEvmAddress', () => {
    it('derives a well-formed, EIP-55 checksummed address', async () => {
      await setMnemonic(testMnemonic, testPassword)
      const address = await getWirexEvmAddress(testPassword)
      expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/)
      // Mixed case proves it went through checksum encoding rather than
      // being returned all-lowercase.
      expect(address).not.toBe(address.toLowerCase())
      expect(address).not.toBe(address.toUpperCase())
    })

    it('is deterministic for the same mnemonic and password', async () => {
      await setMnemonic(testMnemonic, testPassword)
      const first = await getWirexEvmAddress(testPassword)
      const second = await getWirexEvmAddress(testPassword)
      expect(first).toBe(second)
    })

    it('derives a different address for a different mnemonic', async () => {
      await setMnemonic(testMnemonic, testPassword)
      const address1 = await getWirexEvmAddress(testPassword)

      localStorage.clear()
      await setMnemonic(otherMnemonic, testPassword)
      const address2 = await getWirexEvmAddress(testPassword)

      expect(address1).not.toBe(address2)
    })

    it('throws when no mnemonic is stored', async () => {
      await expect(getWirexEvmAddress(testPassword)).rejects.toThrow('No encrypted mnemonic found')
    })

    it('throws on the wrong password', async () => {
      await setMnemonic(testMnemonic, testPassword)
      await expect(getWirexEvmAddress('wrong-password')).rejects.toThrow()
    })
  })

  describe('deployWirexKernelAccount', () => {
    beforeEach(async () => {
      vi.mocked(createSDK).mockReset()
      vi.stubEnv('VITE_WIREX_SDK_ENV', 'uat')
      vi.stubEnv('VITE_WIREX_COMPANY_ID', 'test-company-id')
      await setMnemonic(testMnemonic, testPassword)
    })

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('throws when VITE_WIREX_SDK_ENV is missing or invalid', async () => {
      vi.stubEnv('VITE_WIREX_SDK_ENV', 'not-a-real-env')
      await expect(deployWirexKernelAccount(testPassword)).rejects.toThrow('VITE_WIREX_SDK_ENV')
      expect(createSDK).not.toHaveBeenCalled()
    })

    it('throws when VITE_WIREX_COMPANY_ID is missing', async () => {
      vi.stubEnv('VITE_WIREX_COMPANY_ID', '')
      await expect(deployWirexKernelAccount(testPassword)).rejects.toThrow('VITE_WIREX_COMPANY_ID')
      expect(createSDK).not.toHaveBeenCalled()
    })

    it('initializes the SDK with the configured env, company id, and our config proxy', async () => {
      vi.mocked(createSDK).mockResolvedValue(makeSdk() as never)
      await deployWirexKernelAccount(testPassword)

      expect(createSDK).toHaveBeenCalledWith(
        expect.objectContaining({
          env: 'uat',
          companyId: 'test-company-id',
          configUrl: '/api/wirex-config',
        }),
      )
    })

    it('runs allInOneStepOnboarding and returns its transaction hash when nothing is installed yet', async () => {
      const sdk = makeSdk({ isPolicyInstalled: false, isExecutorInstalled: false, transactionHash: '0xAllInOne' })
      vi.mocked(createSDK).mockResolvedValue(sdk as never)

      const result = await deployWirexKernelAccount(testPassword)

      expect(sdk.crypto.onboarding.allInOneStepOnboarding).toHaveBeenCalledTimes(1)
      expect(sdk.crypto.accountAbstraction.signInExecutor).not.toHaveBeenCalled()
      expect(sdk.crypto.accountAbstraction.signInPolicy).not.toHaveBeenCalled()
      expect(sdk.crypto.accountContract.registerInAccounts).not.toHaveBeenCalled()
      expect(result).toEqual({ walletAddress: '0xSmartWallet', transactionHash: '0xAllInOne' })
    })

    it('finishes only the remaining steps, and returns a null transaction hash, when onboarding is partially complete', async () => {
      const sdk = makeSdk({
        isPolicyInstalled: false,
        isExecutorInstalled: true,
        isWalletInAccounts: false,
      })
      vi.mocked(createSDK).mockResolvedValue(sdk as never)

      const result = await deployWirexKernelAccount(testPassword)

      expect(sdk.crypto.onboarding.allInOneStepOnboarding).not.toHaveBeenCalled()
      expect(sdk.crypto.accountAbstraction.signInExecutor).not.toHaveBeenCalled()
      expect(sdk.crypto.accountAbstraction.signInPolicy).toHaveBeenCalledTimes(1)
      expect(sdk.crypto.accountContract.registerInAccounts).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ walletAddress: '0xSmartWallet', transactionHash: null })
    })

    it('skips registerInAccounts when the wallet is already registered', async () => {
      const sdk = makeSdk({ isPolicyInstalled: true, isExecutorInstalled: true, isWalletInAccounts: true })
      vi.mocked(createSDK).mockResolvedValue(sdk as never)

      await deployWirexKernelAccount(testPassword)

      expect(sdk.crypto.accountContract.registerInAccounts).not.toHaveBeenCalled()
    })

    it('exposes an EIP-1193 provider backed by the derived signer', async () => {
      let capturedGetMainWalletClient: (() => unknown) | undefined
      vi.mocked(createSDK).mockImplementation((async (config: { getMainWalletClient: () => unknown }) => {
        capturedGetMainWalletClient = config.getMainWalletClient
        return makeSdk()
      }) as never)

      await deployWirexKernelAccount(testPassword)
      const expectedAddress = await getWirexEvmAddress(testPassword)

      const mainWalletClient = capturedGetMainWalletClient!() as {
        address: string
        getEthereumProvider: () => Promise<{ request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }>
      }
      expect(mainWalletClient.address).toBe(expectedAddress)

      const provider = await mainWalletClient.getEthereumProvider()
      await expect(provider.request({ method: 'eth_requestAccounts' })).resolves.toEqual([expectedAddress])
      await expect(provider.request({ method: 'eth_accounts' })).resolves.toEqual([expectedAddress])
      await expect(provider.request({ method: 'personal_sign', params: ['0xdead'] })).resolves.toMatch(/^0x/)
      await expect(provider.request({ method: 'some_unsupported_method' })).rejects.toThrow(
        'does not support RPC method',
      )
    })
  })
})
