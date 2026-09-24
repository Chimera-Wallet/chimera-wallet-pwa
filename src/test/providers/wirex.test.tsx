import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WirexProvider, useWirex, WirexProfileInput } from '../../providers/wirex'
import {
  ensureWirexUser,
  getWirexCards,
  getWirexUserByAddress,
  getWirexVerificationLink,
  getWirexWallet,
  issueVirtualCard,
  WirexUser,
} from '../../lib/wirex'
import { deployWirexKernelAccount, getWirexEvmAddress } from '../../lib/wirexWallet'

vi.mock('../../lib/wirex', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/wirex')>()
  return {
    ...actual,
    ensureWirexUser: vi.fn(),
    getWirexCards: vi.fn(),
    getWirexWallet: vi.fn(),
    getWirexUserByAddress: vi.fn(),
    getWirexVerificationLink: vi.fn(),
    issueVirtualCard: vi.fn(),
  }
})

vi.mock('../../lib/wirexWallet', () => ({
  deployWirexKernelAccount: vi.fn(),
  getWirexEvmAddress: vi.fn(),
}))

const POLL_INTERVAL_MS = 30_000
const MAX_ATTEMPTS = 10
const testPassword = 'testpassword'

const testProfile: WirexProfileInput = {
  email: 'user@test.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
}

const testWallet = { wallet_address: '0xWallet', wallet_status: 'Active' }

describe('WirexProvider deployWirexWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_WIREX_ENABLED', 'true')
    vi.mocked(getWirexEvmAddress).mockResolvedValue('0xUser')
    vi.mocked(ensureWirexUser).mockResolvedValue({
      user_id: 'u1',
      user_address: '0xUser',
      chain_id: 1,
      email: 'user@test.com',
    })
    vi.mocked(getWirexCards).mockResolvedValue({ data: [] })
    vi.mocked(getWirexWallet).mockResolvedValue(null)
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
      await result.current.deployWirexWallet(testPassword, testProfile)
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
      await result.current.deployWirexWallet(testPassword, testProfile)
    })

    const deployOrder = vi.mocked(deployWirexKernelAccount).mock.invocationCallOrder[0]
    const ensureUserOrder = vi.mocked(ensureWirexUser).mock.invocationCallOrder[0]
    expect(deployOrder).toBeLessThan(ensureUserOrder)
  })

  it('throws when no Wirex user exists yet and no profile is given', async () => {
    const { result } = renderHook(() => useWirex(), { wrapper: WirexProvider })
    await expect(result.current.deployWirexWallet(testPassword)).rejects.toThrow(
      'Missing profile info required to create a Wirex user',
    )
    expect(ensureWirexUser).not.toHaveBeenCalled()
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

describe('WirexProvider Wirex-hosted KYC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_WIREX_ENABLED', 'true')
    vi.mocked(getWirexEvmAddress).mockResolvedValue('0xUser')
    vi.mocked(getWirexCards).mockResolvedValue({ data: [] })
    vi.mocked(getWirexWallet).mockResolvedValue(null)
    vi.mocked(deployWirexKernelAccount).mockResolvedValue({ walletAddress: '0xUser', transactionHash: null })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const setupWithUser = async () => {
    vi.mocked(ensureWirexUser).mockResolvedValue({
      user_id: 'u1',
      user_address: '0xUser',
      chain_id: 1,
      email: 'user@test.com',
      verificationStatus: 'None',
    })
    vi.mocked(getWirexWallet).mockResolvedValueOnce(testWallet)
    const { result } = renderHook(() => useWirex(), { wrapper: WirexProvider })
    await act(async () => {
      await result.current.deployWirexWallet(testPassword, testProfile)
    })
    return result
  }

  it('exposes wirexVerificationStatus from the current Wirex user', async () => {
    const result = await setupWithUser()
    expect(result.current.wirexVerificationStatus).toBe('None')
  })

  it('startWirexVerification opens the hosted Sumsub link for this user', async () => {
    const result = await setupWithUser()
    vi.mocked(getWirexVerificationLink).mockResolvedValue('https://verify.sumsub.com/xyz')
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    await act(async () => {
      await result.current.startWirexVerification()
    })

    expect(getWirexVerificationLink).toHaveBeenCalledWith('0xUser')
    expect(openSpy).toHaveBeenCalledWith('https://verify.sumsub.com/xyz', '_blank', 'noopener,noreferrer')
  })

  it('refreshWirexUser re-fetches the user and updates the verification status', async () => {
    const result = await setupWithUser()
    vi.mocked(getWirexUserByAddress).mockResolvedValue({
      user_id: 'u1',
      user_address: '0xUser',
      chain_id: 1,
      email: 'user@test.com',
      verificationStatus: 'Approved',
    })

    await act(async () => {
      await result.current.refreshWirexUser()
    })

    expect(getWirexUserByAddress).toHaveBeenCalledWith('0xUser')
    expect(result.current.wirexVerificationStatus).toBe('Approved')
  })
})

describe('WirexProvider virtual card issuance eligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_WIREX_ENABLED', 'true')
    vi.mocked(getWirexEvmAddress).mockResolvedValue('0xUser')
    vi.mocked(getWirexCards).mockResolvedValue({ data: [] })
    vi.mocked(getWirexWallet).mockResolvedValue(null)
    vi.mocked(deployWirexKernelAccount).mockResolvedValue({ walletAddress: '0xUser', transactionHash: null })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const setupWithUser = async (user: WirexUser) => {
    vi.mocked(ensureWirexUser).mockResolvedValue(user)
    vi.mocked(getWirexWallet).mockResolvedValueOnce(testWallet)
    const { result } = renderHook(() => useWirex(), { wrapper: WirexProvider })
    await act(async () => {
      await result.current.deployWirexWallet(testPassword, testProfile)
    })
    return result
  }

  const eligibleUser: WirexUser = {
    user_id: 'u1',
    user_address: '0xUser',
    chain_id: 1,
    email: 'user@test.com',
    capabilities: [{ type: 'VisaVirtualCard', status: 'Active' }],
  }

  const ineligibleUser: WirexUser = {
    user_id: 'u1',
    user_address: '0xUser',
    chain_id: 1,
    email: 'user@test.com',
    capabilities: [{ type: 'VisaVirtualCard', status: 'NotFulfilled', status_reason: 'SDD verification required' }],
  }

  it('exposes canIssueVirtualCard as true when the capability is Active', async () => {
    const result = await setupWithUser(eligibleUser)
    expect(result.current.canIssueVirtualCard).toBe(true)
  })

  it('exposes canIssueVirtualCard as false when the capability is not Active', async () => {
    const result = await setupWithUser(ineligibleUser)
    expect(result.current.canIssueVirtualCard).toBe(false)
  })

  it('issueWirexCard succeeds and calls issueVirtualCard when eligible', async () => {
    const result = await setupWithUser(eligibleUser)
    vi.mocked(issueVirtualCard).mockResolvedValue({ id: 'card-1' })

    await act(async () => {
      await result.current.issueWirexCard()
    })

    expect(issueVirtualCard).toHaveBeenCalledWith({ userAddress: '0xUser' })
  })

  it('issueWirexCard throws surfacing status_reason and never calls issueVirtualCard when ineligible', async () => {
    const result = await setupWithUser(ineligibleUser)

    await expect(result.current.issueWirexCard()).rejects.toThrow('SDD verification required')
    expect(issueVirtualCard).not.toHaveBeenCalled()
  })

  it('issueWirexCard throws a generic message when ineligible with no status_reason', async () => {
    const result = await setupWithUser({
      ...ineligibleUser,
      capabilities: [{ type: 'VisaVirtualCard', status: 'NotFulfilled' }],
    })

    await expect(result.current.issueWirexCard()).rejects.toThrow('Virtual card issuance is not available for this account yet')
    expect(issueVirtualCard).not.toHaveBeenCalled()
  })
})
