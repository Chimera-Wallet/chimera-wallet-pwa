/**
 * Wirex card/wallet onboarding state.
 *
 * KYC is Wirex's own hosted flow (see docs.wirexapp.com/docs/retail-kyc-hosted):
 * a user is registered with minimal data (see WirexProfileInput below),
 * startWirexVerification() opens a Sumsub-hosted redirect for them to
 * complete verification, and refreshWirexUser()/wirexVerificationStatus
 * reflect Wirex's own KYC state once they return.
 */

import { ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  canIssueVirtualCard as checkCanIssueVirtualCard,
  ensureWirexUser,
  getWirexCards,
  getWirexUserByAddress,
  getWirexVerificationLink,
  getWirexWallet,
  issueVirtualCard,
  VIRTUAL_CARD_CAPABILITY,
  WirexCard,
  WirexUser,
  WirexVerificationStatus,
  WirexWallet,
} from '../lib/wirex'
import { deployWirexKernelAccount, getWirexEvmAddress } from '../lib/wirexWallet'

export const isWirexEnabled = (): boolean => import.meta.env.VITE_WIREX_ENABLED === 'true'

const WALLET_INDEXING_POLL_INTERVAL_MS = 30_000
const WALLET_INDEXING_MAX_ATTEMPTS = 10

/** Minimal contact info to register a Wirex user — collected directly (not sourced from any other session), right before starting Wirex's hosted KYC. */
export interface WirexProfileInput {
  email: string
  firstName: string
  lastName: string
}

type WirexContextProps = {
  wirexUser: WirexUser | null
  wirexUserLoading: boolean
  wirexUserError: string | null
  /** Wirex's own KYC verification status for this user, if known. */
  wirexVerificationStatus: WirexVerificationStatus | undefined
  wirexWallet: WirexWallet | null
  wirexWalletLoading: boolean
  wirexWalletError: string | null
  /** True while polling for the deployed wallet to finish Wirex-side indexing (see deployWirexWallet). */
  wirexWalletDeployPending: boolean
  /** True once polling gave up after WALLET_INDEXING_MAX_ATTEMPTS without the wallet appearing. */
  wirexWalletDeployTimedOut: boolean
  deployWirexWallet: (password: string, profile?: WirexProfileInput) => Promise<void>
  /** Opens Wirex's hosted (Sumsub) KYC page for this user in a new tab. */
  startWirexVerification: () => Promise<void>
  /** Re-fetches this user's record (e.g. after returning from hosted KYC) to pick up an updated verification status. */
  refreshWirexUser: () => Promise<void>
  wirexCards: WirexCard[]
  wirexCardsLoading: boolean
  wirexCardsError: string | null
  refreshWirexCards: () => void
  /** Whether the current Wirex user's VisaVirtualCard capability is Active — see canIssueVirtualCard in ../lib/wirex.ts. */
  canIssueVirtualCard: boolean
  /** Only virtual card issuance is implemented — physical/metal is planned for next year, see ../lib/wirex.ts. */
  issueWirexCard: () => Promise<void>
}

export const WirexContext = createContext<WirexContextProps>({
  wirexUser: null,
  wirexUserLoading: false,
  wirexUserError: null,
  wirexVerificationStatus: undefined,
  wirexWallet: null,
  wirexWalletLoading: false,
  wirexWalletError: null,
  wirexWalletDeployPending: false,
  wirexWalletDeployTimedOut: false,
  deployWirexWallet: async () => {},
  startWirexVerification: async () => {},
  refreshWirexUser: async () => {},
  wirexCards: [],
  wirexCardsLoading: false,
  wirexCardsError: null,
  refreshWirexCards: () => {},
  canIssueVirtualCard: false,
  issueWirexCard: async () => {},
})

export const WirexProvider = ({ children }: { children: ReactNode }) => {
  const [wirexUser, setWirexUser] = useState<WirexUser | null>(null)
  const [wirexUserLoading, setWirexUserLoading] = useState(false)
  const [wirexUserError, setWirexUserError] = useState<string | null>(null)

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

  // Wallet lookup runs once a Wirex user exists
  useEffect(() => {
    if (!wirexUser) {
      setWirexWallet(null)
      return
    }

    let cancelled = false
    setWirexWalletLoading(true)
    setWirexWalletError(null)

    getWirexWallet(wirexUser.user_address)
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

  const deployWirexWallet = async (password: string, profile?: WirexProfileInput): Promise<void> => {
    if (!isWirexEnabled()) throw new Error('Wirex is not enabled')

    stopWalletIndexingPoll()
    setWirexWalletLoading(true)
    setWirexWalletError(null)
    setWirexWalletDeployTimedOut(false)
    try {
      await deployWirexKernelAccount(password)
      let user = wirexUser
      if (!user) {
        setWirexUserLoading(true)
        setWirexUserError(null)
        try {
          if (!profile) throw new Error('Missing profile info required to create a Wirex user')
          const userAddress = await getWirexEvmAddress(password)
          user = await ensureWirexUser({
            userAddress,
            email: profile.email,
            firstName: profile.firstName,
            lastName: profile.lastName,
          })
          setWirexUser(user)
        } catch (err) {
          setWirexUserError(err instanceof Error ? err.message : 'Failed to set up Wirex account')
          throw err
        } finally {
          setWirexUserLoading(false)
        }
      }
      if (!user) throw new Error('No Wirex user to deploy a wallet for')

      const userAddress = user.user_address
      setWirexWalletDeployPending(true)
      const wallet = await new Promise<WirexWallet | null>((resolve, reject) => {
        let attempts = 0

        const poll = async () => {
          attempts += 1
          try {
            const result = await getWirexWallet(userAddress)
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

  const startWirexVerification = async (): Promise<void> => {
    if (!wirexUser) throw new Error('No Wirex user to verify')
    const url = await getWirexVerificationLink(wirexUser.user_address)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const refreshWirexUser = async (): Promise<void> => {
    if (!wirexUser) return
    setWirexUserLoading(true)
    setWirexUserError(null)
    try {
      const user = await getWirexUserByAddress(wirexUser.user_address)
      setWirexUser(user)
    } catch (err) {
      setWirexUserError(err instanceof Error ? err.message : 'Failed to refresh Wirex user')
      throw err
    } finally {
      setWirexUserLoading(false)
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

    getWirexCards(wirexUser.user_address)
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
      if (!checkCanIssueVirtualCard(wirexUser)) {
        const reason = wirexUser.capabilities?.find((c) => c.type === VIRTUAL_CARD_CAPABILITY)?.status_reason
        throw new Error(reason ?? 'Virtual card issuance is not available for this account yet')
      }

  
      await issueVirtualCard({ userAddress: wirexUser.user_address })
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
        wirexVerificationStatus: wirexUser?.verificationStatus,
        wirexWallet,
        wirexWalletLoading,
        wirexWalletError,
        wirexWalletDeployPending,
        wirexWalletDeployTimedOut,
        deployWirexWallet,
        startWirexVerification,
        refreshWirexUser,
        wirexCards,
        wirexCardsLoading,
        wirexCardsError,
        refreshWirexCards,
        canIssueVirtualCard: wirexUser ? checkCanIssueVirtualCard(wirexUser) : false,
        issueWirexCard,
      }}
    >
      {children}
    </WirexContext.Provider>
  )
}

export const useWirex = () => useContext(WirexContext)
