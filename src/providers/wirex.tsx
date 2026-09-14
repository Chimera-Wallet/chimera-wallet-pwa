/**
 * Wirex card/wallet onboarding state.
 *
 * KYC tbd. Currently it acts as if we will use IDFlow but there may be 
 * complications as wirex needs to do a "full audit"
 *
 */

import { ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react'
import { getKycEmail, fetchKycUserProfile, getValidAccessToken, getStoredKycStatus } from '../lib/kyc'
import {
  ensureWirexUser,
  getWirexCards,
  getWirexWallet,
  issueVirtualCard,
  WirexCard,
  WirexUser,
  WirexWallet,
} from '../lib/wirex'
import { deployWirexKernelAccount } from '../lib/wirexWallet'

export const isWirexEnabled = (): boolean => import.meta.env.VITE_WIREX_ENABLED === 'true'

// Wirex deploys the smart wallet on-chain synchronously, but only indexes it
// (making GET /api/v1/wallet start returning it) asynchronously afterward —
// see ../lib/wirex.ts's Wallet section. There's no webhook-backed status
// endpoint to poll instead (no Azure Storage exists anywhere in this repo to
// back one, and BankOrderStatus.tsx's existing "wait for an async external
// status" flow already solves this the simple way: poll the live status
// endpoint directly). Mirrors that screen's POLL_INTERVAL/cleanup shape, but
// bounded — a wallet deploy is a one-time bootstrap step, not a screen a user
// might leave open indefinitely, so it needs a ceiling rather than polling
// forever if Wirex's indexer stalls.
const WALLET_INDEXING_POLL_INTERVAL_MS = 30_000
const WALLET_INDEXING_MAX_ATTEMPTS = 10

type WirexContextProps = {
  wirexUser: WirexUser | null
  wirexUserLoading: boolean
  wirexUserError: string | null
  /** Re-run the lookup/ensure-user flow (e.g. after IDFlow verification completes). */
  refreshWirexUser: () => void
  wirexWallet: WirexWallet | null
  wirexWalletLoading: boolean
  wirexWalletError: string | null
  /** True while polling for the deployed wallet to finish Wirex-side indexing (see deployWirexWallet). */
  wirexWalletDeployPending: boolean
  /** True once polling gave up after WALLET_INDEXING_MAX_ATTEMPTS without the wallet appearing. */
  wirexWalletDeployTimedOut: boolean
  /**
   * Deploy this user's Wirex wallet, then poll until Wirex finishes indexing
   * it (or the poll times out — see wirexWalletDeployTimedOut). Throws if the
   * on-chain deploy itself fails; a poll timeout does not throw, it just sets
   * wirexWalletDeployTimedOut so the caller can offer a manual retry/refresh.
   */
  deployWirexWallet: (password: string) => Promise<void>
  wirexCards: WirexCard[]
  wirexCardsLoading: boolean
  wirexCardsError: string | null
  refreshWirexCards: () => void
  /** Only virtual card issuance is implemented — see ../lib/wirex.ts's TODO on metal/physical. */
  issueWirexCard: () => Promise<void>
}

export const WirexContext = createContext<WirexContextProps>({
  wirexUser: null,
  wirexUserLoading: false,
  wirexUserError: null,
  refreshWirexUser: () => {},
  wirexWallet: null,
  wirexWalletLoading: false,
  wirexWalletError: null,
  wirexWalletDeployPending: false,
  wirexWalletDeployTimedOut: false,
  deployWirexWallet: async () => {},
  wirexCards: [],
  wirexCardsLoading: false,
  wirexCardsError: null,
  refreshWirexCards: () => {},
  issueWirexCard: async () => {},
})

export const WirexProvider = ({ children }: { children: ReactNode }) => {
  const [wirexUser, setWirexUser] = useState<WirexUser | null>(null)
  const [wirexUserLoading, setWirexUserLoading] = useState(false)
  const [wirexUserError, setWirexUserError] = useState<string | null>(null)
  const [refreshCount, setRefreshCount] = useState(0)

  const [wirexWallet, setWirexWallet] = useState<WirexWallet | null>(null)
  const [wirexWalletLoading, setWirexWalletLoading] = useState(false)
  const [wirexWalletError, setWirexWalletError] = useState<string | null>(null)
  const [wirexWalletDeployPending, setWirexWalletDeployPending] = useState(false)
  const [wirexWalletDeployTimedOut, setWirexWalletDeployTimedOut] = useState(false)
  // Ref (not state) so a new deploy attempt can synchronously cancel a
  // still-running poll from a previous one without waiting on a re-render.
  const walletIndexingPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [wirexCards, setWirexCards] = useState<WirexCard[]>([])
  const [wirexCardsLoading, setWirexCardsLoading] = useState(false)
  const [wirexCardsError, setWirexCardsError] = useState<string | null>(null)
  const [cardsRefreshCount, setCardsRefreshCount] = useState(0)

  useEffect(() => {
    if (!isWirexEnabled()) return

    // Only onboard users IDFlow has already confirmed — Wirex's API-based
    // user creation is standing in for KYC here, so it must not run ahead of
    // (or instead of) IDFlow actually verifying the person.
    if (getStoredKycStatus() !== 'confirmed') return

    const email = getKycEmail()
    if (!email) return

    let cancelled = false
    setWirexUserLoading(true)
    setWirexUserError(null)

    const run = async () => {
      let firstName: string | undefined
      let lastName: string | undefined
      const accessToken = await getValidAccessToken()
      if (accessToken) {
        try {
          const profile = await fetchKycUserProfile(accessToken)
          firstName = profile.firstName
          lastName = profile.lastName
        } catch {
          // Name is optional for the lookup/create call — proceed without it.
        }
      }

      return ensureWirexUser({ email, firstName, lastName })
    }

    run()
      .then((user) => {
        if (!cancelled) setWirexUser(user)
      })
      .catch((err) => {
        if (!cancelled) setWirexUserError(err instanceof Error ? err.message : 'Failed to set up Wirex account')
      })
      .finally(() => {
        if (!cancelled) setWirexUserLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [refreshCount])

  const refreshWirexUser = () => setRefreshCount((n) => n + 1)

  // Wallet lookup runs once a Wirex user exists 
  useEffect(() => {
    if (!wirexUser) {
      setWirexWallet(null)
      return
    }

    let cancelled = false
    setWirexWalletLoading(true)
    setWirexWalletError(null)

    const run = async () => {
      const kycAccessToken = await getValidAccessToken()
      if (!kycAccessToken) throw new Error('No active KYC session')
      return getWirexWallet(wirexUser.email, kycAccessToken)
    }

    run()
      .then((wallet) => {
        if (!cancelled) setWirexWallet(wallet)
      })
      .catch((err) => {
        if (!cancelled) setWirexWalletError(err instanceof Error ? err.message : 'Failed to look up Wirex wallet')
      })
      .finally(() => {
        if (!cancelled) setWirexWalletLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [wirexUser])

  // Stop any poll from a previous deployWirexWallet call still running —
  // called both on unmount and when a new deploy attempt supersedes an old one.
  const stopWalletIndexingPoll = () => {
    if (walletIndexingPollRef.current !== null) {
      clearInterval(walletIndexingPollRef.current)
      walletIndexingPollRef.current = null
    }
  }

  useEffect(() => stopWalletIndexingPoll, [])

  const deployWirexWallet = async (password: string): Promise<void> => {
    if (!wirexUser) throw new Error('No Wirex user to deploy a wallet for')

    stopWalletIndexingPoll()
    setWirexWalletLoading(true)
    setWirexWalletError(null)
    setWirexWalletDeployTimedOut(false)
    try {
      await deployWirexKernelAccount(password)
      const kycAccessToken = await getValidAccessToken()
      if (!kycAccessToken) throw new Error('No active KYC session')

      // Wirex registers the deployed wallet on-chain itself
      // (createUserAccountWithWallet) and indexes it asynchronously — there's
      // no REST call to push the address to Wirex directly (see
      // ../lib/wirex.ts's Wallet section), so poll GET /api/v1/wallet (same
      // interval/cleanup shape as BankOrderStatus.tsx) until it appears or we
      // give up.
      setWirexWalletDeployPending(true)
      const wallet = await new Promise<WirexWallet | null>((resolve, reject) => {
        let attempts = 0

        const poll = async () => {
          attempts += 1
          try {
            const result = await getWirexWallet(wirexUser.email, kycAccessToken)
            if (result) {
              stopWalletIndexingPoll()
              resolve(result)
              return
            }
          } catch (err) {
            stopWalletIndexingPoll()
            reject(err)
            return
          }

          if (attempts >= WALLET_INDEXING_MAX_ATTEMPTS) {
            stopWalletIndexingPoll()
            resolve(null)
          }
        }

        walletIndexingPollRef.current = setInterval(poll, WALLET_INDEXING_POLL_INTERVAL_MS)
        poll()
      })

      setWirexWallet(wallet)
      setWirexWalletDeployTimedOut(wallet === null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to deploy Wirex wallet'
      setWirexWalletError(message)
      throw err
    } finally {
      setWirexWalletDeployPending(false)
      setWirexWalletLoading(false)
    }
  }

  // Card list lookup runs once a Wirex user exists, same as wallet lookup.
  useEffect(() => {
    if (!wirexUser) {
      setWirexCards([])
      return
    }

    let cancelled = false
    setWirexCardsLoading(true)
    setWirexCardsError(null)

    const run = async () => {
      const kycAccessToken = await getValidAccessToken()
      if (!kycAccessToken) throw new Error('No active KYC session')
      return getWirexCards(wirexUser.email, kycAccessToken)
    }

    run()
      .then((result) => {
        if (!cancelled) setWirexCards(result?.data ?? [])
      })
      .catch((err) => {
        if (!cancelled) setWirexCardsError(err instanceof Error ? err.message : 'Failed to look up Wirex cards')
      })
      .finally(() => {
        if (!cancelled) setWirexCardsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [wirexUser, cardsRefreshCount])

  const refreshWirexCards = () => setCardsRefreshCount((n) => n + 1)

  const issueWirexCard = async (): Promise<void> => {
    if (!wirexUser) throw new Error('No Wirex user to issue a card for')

    setWirexCardsLoading(true)
    setWirexCardsError(null)
    try {
      const kycAccessToken = await getValidAccessToken()
      if (!kycAccessToken) throw new Error('No active KYC session')
      // Issuance only returns the new card's id, not its full record — refresh
      // the list to pick up the newly issued card's full details.
      await issueVirtualCard({ email: wirexUser.email, kycAccessToken })
      refreshWirexCards()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to issue Wirex card'
      setWirexCardsError(message)
      throw err
    } finally {
      setWirexCardsLoading(false)
    }
  }

  return (
    <WirexContext.Provider
      value={{
        wirexUser,
        wirexUserLoading,
        wirexUserError,
        refreshWirexUser,
        wirexWallet,
        wirexWalletLoading,
        wirexWalletError,
        wirexWalletDeployPending,
        wirexWalletDeployTimedOut,
        deployWirexWallet,
        wirexCards,
        wirexCardsLoading,
        wirexCardsError,
        refreshWirexCards,
        issueWirexCard,
      }}
    >
      {children}
    </WirexContext.Provider>
  )
}

export const useWirex = () => useContext(WirexContext)
