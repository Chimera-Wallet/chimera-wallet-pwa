import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WirexProvider, useWirex, WirexOnboardingInput } from '../../providers/wirex'
import { getStoredKycStatus, fetchKycUserProfile, getValidAccessToken } from '../../lib/kyc'
import { ensureWirexUser, getWirexCards, getWirexWallet } from '../../lib/wirex'
import { deployWirexKernelAccount, getWirexEvmAddress } from '../../lib/wirexWallet'

vi.mock('../../lib/kyc', () => ({
  getStoredKycStatus: vi.fn(),
  fetchKycUserProfile: vi.fn(),
  getValidAccessToken: vi.fn(),
}))

vi.mock('../../lib/wirex', () => ({
  ensureWirexUser: vi.fn(),
  getWirexCards: vi.fn(),
  getWirexWallet: vi.fn(),
  issueVirtualCard: vi.fn(),
}))

vi.mock('../../lib/wirexWallet', () => ({
  deployWirexKernelAccount: vi.fn(),
  getWirexEvmAddress: vi.fn(),
}))

const POLL_INTERVAL_MS = 30_000
const MAX_ATTEMPTS = 10
const testPassword = 'testpassword'

const testOnboarding: WirexOnboardingInput = {
  dateOfBirth: '1990-01-15',
  phoneNumber: '+14155551234',
  nationality: 'US',
  residenceAddress: { line1: '123 Main St', city: 'San Francisco', postCode: '94105', country: 'US' },
  isPep: false,
}

const testWallet = { wallet_address: '0xWallet', wallet_status: 'Active' }

describe('WirexProvider deployWirexWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_WIREX_ENABLED', 'true')
    vi.mocked(getStoredKycStatus).mockReturnValue('confirmed')
    vi.mocked(getValidAccessToken).mockResolvedValue('kyc-access-token')
    vi.mocked(fetchKycUserProfile).mockResolvedValue({
      email: 'user@test.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
    })
    vi.mocked(getWirexEvmAddress).mockResolvedValue('0xUser')
    vi.mocked(ensureWirexUser).mockResolvedValue({
      user_id: 'u1',
      user_address: '0xUser',
      chain_id: 1,
      email: 'user@test.com',
    })
    vi.mocked(getWirexCards).mockResolvedValue({ data: [] })
    vi.mocked(deployWirexKernelAccount).mockResolvedValue({ walletAddress: '0xUser', transactionHash: null })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

 
  const setup = async () => {
    const { result } = renderHook(() => useWirex(), { wrapper: WirexProvider })
    vi.mocked(getWirexWallet).mockResolvedValueOnce(testWallet)
    await act(async () => {
      await result.current.deployWirexWallet(testPassword, testOnboarding)
    })
    vi.mocked(getWirexWallet).mockClear()
    vi.mocked(deployWirexKernelAccount).mockClear()
    vi.mocked(ensureWirexUser).mockClear()
    vi.mocked(getWirexEvmAddress).mockClear()
    return result
  }


  it('deploys the on-chain wallet before creating the Wirex user', async () => {
    const { result } = renderHook(() => useWirex(), { wrapper: WirexProvider })
    vi.mocked(getWirexWallet).mockResolvedValueOnce(testWallet)

    await act(async () => {
      await result.current.deployWirexWallet(testPassword, testOnboarding)
    })

    const deployOrder = vi.mocked(deployWirexKernelAccount).mock.invocationCallOrder[0]
    const ensureUserOrder = vi.mocked(ensureWirexUser).mock.invocationCallOrder[0]
    expect(deployOrder).toBeLessThan(ensureUserOrder)
  })

  it('polls until the wallet appears, then stops', async () => {
    const result = await setup()
    vi.mocked(getWirexWallet).mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(testWallet)

    vi.useFakeTimers()
    let deployPromise!: Promise<void>
    await act(async () => {
      deployPromise = result.current.deployWirexWallet(testPassword)
      await vi.advanceTimersByTimeAsync(0) // 1st attempt: immediate, returns null
    })
    expect(getWirexWallet).toHaveBeenCalledTimes(1)
    expect(result.current.wirexWalletDeployPending).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS) // 2nd attempt: null
    })
    expect(getWirexWallet).toHaveBeenCalledTimes(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS) // 3rd attempt: wallet found
    })
    await act(async () => {
      await deployPromise
    })

    expect(result.current.wirexWallet).toEqual(testWallet)
    expect(result.current.wirexWalletDeployPending).toBe(false)
    expect(result.current.wirexWalletDeployTimedOut).toBe(false)

    // The interval must be cleared once the wallet is found — no further polling.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3)
    })
    expect(getWirexWallet).toHaveBeenCalledTimes(3)
  })

  it('gives up and reports a timeout after the max attempts, without throwing', async () => {
    const result = await setup()
    vi.mocked(getWirexWallet).mockClear()
    vi.mocked(getWirexWallet).mockResolvedValue(null)

    vi.useFakeTimers()
    let deployPromise!: Promise<void>
    await act(async () => {
      deployPromise = result.current.deployWirexWallet(testPassword)
      await vi.advanceTimersByTimeAsync(0)
    })

    await act(async () => {
      // Enough ticks to exhaust MAX_ATTEMPTS (1 immediate + N interval firings).
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * (MAX_ATTEMPTS + 2))
    })
    await act(async () => {
      await expect(deployPromise).resolves.toBeUndefined()
    })

    expect(getWirexWallet).toHaveBeenCalledTimes(MAX_ATTEMPTS)
    expect(result.current.wirexWallet).toBeNull()
    expect(result.current.wirexWalletDeployPending).toBe(false)
    expect(result.current.wirexWalletDeployTimedOut).toBe(true)

    // No further polling after giving up.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3)
    })
    expect(getWirexWallet).toHaveBeenCalledTimes(MAX_ATTEMPTS)
  })

  it('cancels a running poll when a new deploy attempt supersedes it', async () => {
    const result = await setup()
    vi.mocked(getWirexWallet).mockClear()
    vi.mocked(getWirexWallet).mockResolvedValue(null)

    vi.useFakeTimers()
    await act(async () => {
      void result.current.deployWirexWallet(testPassword)
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(getWirexWallet).toHaveBeenCalledTimes(1)

    // Starting a second deploy should stop the first poll rather than running both.
    vi.mocked(getWirexWallet).mockResolvedValueOnce(testWallet)
    let secondDeploy!: Promise<void>
    await act(async () => {
      secondDeploy = result.current.deployWirexWallet(testPassword)
      await vi.advanceTimersByTimeAsync(0)
    })
    await act(async () => {
      await secondDeploy
    })

    expect(result.current.wirexWallet).toEqual(testWallet)

    // If the first poll were still alive, this would produce extra calls.
    const callsAfterSecondDeploy = vi.mocked(getWirexWallet).mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3)
    })
    expect(getWirexWallet).toHaveBeenCalledTimes(callsAfterSecondDeploy)
  })
})
