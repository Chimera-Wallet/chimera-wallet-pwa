import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { setMnemonic } from '../../lib/mnemonic'
import { getWirexEvmAddress, deployWirexKernelAccount, toBytes16CompanyId } from '../../lib/wirexWallet'
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
  registerTransactionHash?: string
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
      registerInAccounts: vi
        .fn()
        .mockResolvedValue({ success: true, receipt: { transactionHash: overrides.registerTransactionHash ?? '0xRegister' } }),
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
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(JSON.stringify({ defaultCompanyId: '00000000-0000-0000-0000-000000000004' }), { status: 200 })),
      )
      await setMnemonic(testMnemonic, testPassword)
    })

    afterEach(() => {
      vi.unstubAllEnvs()
      vi.unstubAllGlobals()
    })

    it('throws when VITE_WIREX_SDK_ENV is missing or invalid', async () => {
      vi.stubEnv('VITE_WIREX_SDK_ENV', 'not-a-real-env')
      await expect(deployWirexKernelAccount(testPassword)).rejects.toThrow('VITE_WIREX_SDK_ENV')
      expect(createSDK).not.toHaveBeenCalled()
    })

    it('throws when the remote config has no defaultCompanyId', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      await expect(deployWirexKernelAccount(testPassword)).rejects.toThrow('defaultCompanyId')
      expect(createSDK).not.toHaveBeenCalled()
    })

    it('throws when the remote config defaultCompanyId is not a valid 16-byte id', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ defaultCompanyId: 'not-an-id' }), { status: 200 }))
      await expect(deployWirexKernelAccount(testPassword)).rejects.toThrow('Invalid Wirex company id')
      expect(createSDK).not.toHaveBeenCalled()
    })

    it('throws when the remote config request fails', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response('boom', { status: 502 }))
      await expect(deployWirexKernelAccount(testPassword)).rejects.toThrow('Failed to load Wirex config: 502')
      expect(createSDK).not.toHaveBeenCalled()
    })

    it('initializes the SDK with the configured env, the remote config company id, and our config proxy', async () => {
      vi.mocked(createSDK).mockResolvedValue(makeSdk() as never)
      await deployWirexKernelAccount(testPassword)

      expect(createSDK).toHaveBeenCalledWith(
        expect.objectContaining({
          env: 'uat',
          companyId: '0x00000000000000000000000000000004',
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

    it('finishes only the remaining steps, and returns the registration tx hash, when onboarding is partially complete', async () => {
      const sdk = makeSdk({
        isPolicyInstalled: false,
        isExecutorInstalled: true,
        isWalletInAccounts: false,
      })
      // Not registered before, registered after registerInAccounts.
      sdk.crypto.accountContract.isWalletInAccounts.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
      vi.mocked(createSDK).mockResolvedValue(sdk as never)

      const result = await deployWirexKernelAccount(testPassword)

      expect(sdk.crypto.onboarding.allInOneStepOnboarding).not.toHaveBeenCalled()
      expect(sdk.crypto.accountAbstraction.signInExecutor).not.toHaveBeenCalled()
      expect(sdk.crypto.accountAbstraction.signInPolicy).toHaveBeenCalledTimes(1)
      expect(sdk.crypto.accountContract.registerInAccounts).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ walletAddress: '0xSmartWallet', transactionHash: '0xRegister' })
    })

    it('throws when the Accounts registration UserOperation reverts', async () => {
      const sdk = makeSdk({ isWalletInAccounts: false })
      sdk.crypto.accountContract.registerInAccounts.mockResolvedValueOnce({
        success: false,
        reason: 'AA reverted',
        receipt: { transactionHash: '0xBad' },
      })
      vi.mocked(createSDK).mockResolvedValue(sdk as never)

      await expect(deployWirexKernelAccount(testPassword)).rejects.toThrow('registration UserOperation failed')
    })

    it('throws when the wallet is still not registered for the company after onboarding', async () => {
      const sdk = makeSdk({ isPolicyInstalled: false, isExecutorInstalled: false, isWalletInAccounts: false })
      vi.mocked(createSDK).mockResolvedValue(sdk as never)

      await expect(deployWirexKernelAccount(testPassword)).rejects.toThrow(
        'not registered in the Wirex Accounts contract for company 0x00000000000000000000000000000004',
      )
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

describe('toBytes16CompanyId', () => {
  it('converts a UUID to 0x-prefixed bytes16 hex', () => {
    expect(toBytes16CompanyId('00000000-0000-0000-0000-000000000004')).toBe('0x00000000000000000000000000000004')
  })
  it('accepts an id that is already 0x-prefixed hex', () => {
    expect(toBytes16CompanyId('0xABCDEF00000000000000000000000004')).toBe('0xabcdef00000000000000000000000004')
  })
  it.each(['', '0x1234', 'not-a-uuid'])('rejects %j', (id) => {
    expect(() => toBytes16CompanyId(id)).toThrow('Invalid Wirex company id')
  })
})
