/**
 * Wirex card/wallet onboarding state.
 *
 * KYC tbd. Currently it acts as if we will use IDFlow but there may be 
 * complications as wirex needs to do a "full audit"
 *
 */

import { ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react'
import { fetchKycUserProfile, getValidAccessToken, getStoredKycStatus } from '../lib/kyc'
import {
  ensureWirexUser,
  getWirexCards,
  getWirexWallet,
  issueVirtualCard,
  WirexCard,
  WirexResidenceAddress,
  WirexUser,
  WirexWallet,
} from '../lib/wirex'
import { deployWirexKernelAccount, getWirexEvmAddress } from '../lib/wirexWallet'

export const isWirexEnabled = (): boolean => import.meta.env.VITE_WIREX_ENABLED === 'true'

const WALLET_INDEXING_POLL_INTERVAL_MS = 30_000
const WALLET_INDEXING_MAX_ATTEMPTS = 10

/**
 * Compliance fields Wirex's POST /api/v2/user requires (see ../lib/wirex.ts's
 * CreateWirexUserPayload) that IDFlow's profile does not expose today. The
 * caller must collect these itself until IDFlow exposes them or Wirex
 * confirms a reduced set is acceptable — see ../lib/wirex.ts's file comment.
 */
export interface WirexOnboardingInput {
  dateOfBirth: string
  phoneNumber: string
  nationality: string
  residenceAddress: WirexResidenceAddress
  isPep: boolean
}

type WirexContextProps = {
  wirexUser: WirexUser | null
  wirexUserLoading: boolean
  wirexUserError: string | null
  wirexWallet: WirexWallet | null
  wirexWalletLoading: boolean
  wirexWalletError: string | null
  /** True while polling for the deployed wallet to finish Wirex-side indexing (see deployWirexWallet). */
  wirexWalletDeployPending: boolean
  /** True once polling gave up after WALLET_INDEXING_MAX_ATTEMPTS without the wallet appearing. */
  wirexWalletDeployTimedOut: boolean
  deployWirexWallet: (password: string, onboarding?: WirexOnboardingInput) => Promise<void>
  wirexCards: WirexCard[]
  wirexCardsLoading: boolean
  wirexCardsError: string | null
  refreshWirexCards: () => void
  /** Only virtual card issuance is implemented **/
  issueWirexCard: () => Promise<void>
}

export const WirexContext = createContext<WirexContextProps>({
  wirexUser: null,
  wirexUserLoading: false,
  wirexUserError: null,
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

  const deployWirexWallet = async (password: string, onboarding?: WirexOnboardingInput): Promise<void> => {
    if (!isWirexEnabled()) throw new Error('Wirex is not enabled')
    if (getStoredKycStatus() !== 'confirmed') throw new Error('KYC has not been confirmed yet')

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
          const userAddress = await getWirexEvmAddress(password)
          const accessToken = await getValidAccessToken()
          if (!accessToken) throw new Error('No active KYC session')
          const profile = await fetchKycUserProfile(accessToken)
          if (!profile.email || !profile.firstName || !profile.lastName) {
            throw new Error('IDFlow profile is missing required name/email fields')
          }
          if (!onboarding) throw new Error('Missing compliance data required to create a Wirex user')

          user = await ensureWirexUser({
            userAddress,
            email: profile.email,
            firstName: profile.firstName,
            lastName: profile.lastName,
            dateOfBirth: onboarding.dateOfBirth,
            phoneNumber: onboarding.phoneNumber,
            nationality: onboarding.nationality,
            residenceAddress: onboarding.residenceAddress,
            isPep: onboarding.isPep,
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

      const kycAccessToken = await getValidAccessToken()
      if (!kycAccessToken) throw new Error('No active KYC session')
      const userEmail = user.email
      setWirexWalletDeployPending(true)
      const wallet = await new Promise<WirexWallet | null>((resolve, reject) => {
        let attempts = 0

        const poll = async () => {
          attempts += 1
          try {
            const result = await getWirexWallet(userEmail, kycAccessToken)
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
