/**
 * Wirex card/wallet onboarding state.
 *
 * KYC tbd. Currently it acts as if we will use IDFlow but there may be 
 * complications as wirex needs to do a "full audit"
 *
 */

import { ReactNode, createContext, useContext, useEffect, useState } from 'react'
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

type WirexContextProps = {
  wirexUser: WirexUser | null
  wirexUserLoading: boolean
  wirexUserError: string | null
  /** Re-run the lookup/ensure-user flow (e.g. after IDFlow verification completes). */
  refreshWirexUser: () => void
  wirexWallet: WirexWallet | null
  wirexWalletLoading: boolean
  wirexWalletError: string | null
  /** Deploy (or re-check) this user's Wirex wallet. Throws until wirexWallet.ts's on-chain piece is implemented. */
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

    getWirexWallet(wirexUser.email)
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

  const deployWirexWallet = async (password: string): Promise<void> => {
    if (!wirexUser) throw new Error('No Wirex user to deploy a wallet for')

    setWirexWalletLoading(true)
    setWirexWalletError(null)
    try {
      await deployWirexKernelAccount(password)
      // Wirex registers the deployed wallet on-chain itself
      // (createUserAccountWithWallet) and indexes it asynchronously — there's
      // no REST call to push the address to Wirex directly (see
      // ../lib/wirex.ts's Wallet section), so just re-fetch once deployment
      // confirms.
      const wallet = await getWirexWallet(wirexUser.email)
      setWirexWallet(wallet)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to deploy Wirex wallet'
      setWirexWalletError(message)
      throw err
    } finally {
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

    getWirexCards(wirexUser.email)
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
      // Issuance only returns the new card's id, not its full record — refresh
      // the list to pick up the newly issued card's full details.
      await issueVirtualCard({ email: wirexUser.email })
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
