// Card tab when VITE_WIREX_ENABLED is 'true' (see providers/navigation.tsx);
// otherwise the tab keeps showing ../CardReservation.
//
// Shows the onboarding/setup flow until the user has a card, then the card home.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Header from '../../../components/Header'
import Content from '../../../components/Content'
import Loading from '../../../components/Loading'
import { WirexCard, WirexUser, getWirexCards, getWirexUserByAddress } from '../../../lib/wirex'
import { pickActiveCard, readWirexAddress } from './lib'
import WirexSetup from './Setup'
import WirexCardHome from './CardHome'

type State =
  | { phase: 'loading' }
  | { phase: 'setup'; user: WirexUser | null; cards: WirexCard[] }
  | { phase: 'home'; user: WirexUser; card: WirexCard }

const toState = (user: WirexUser | null, cards: WirexCard[]): State => {
  const card = pickActiveCard(cards)
  return user && card ? { phase: 'home', user, card } : { phase: 'setup', user, cards }
}

export default function AppWirexCard() {
  const { t } = useTranslation()
  const [state, setState] = useState<State>({ phase: 'loading' })

  // Reload a previously used account on mount; any failure drops to setup,
  // where the user can retry with Refresh / Load existing account.
  useEffect(() => {
    let cancelled = false
    const address = readWirexAddress()
    if (!address) {
      setState({ phase: 'setup', user: null, cards: [] })
      return
    }
    ;(async () => {
      let user: WirexUser | null = null
      let cards: WirexCard[] = []
      try {
        user = await getWirexUserByAddress(address)
        if (user) cards = (await getWirexCards(user.user_address))?.data ?? []
      } catch {
        // fall through to setup with whatever loaded
      }
      if (!cancelled) setState(toState(user, cards))
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const title = t('apps.wirexCard.title')

  if (state.phase === 'loading') {
    return (
      <>
        <Header text={title} />
        <Content>
          <Loading />
        </Content>
      </>
    )
  }

  if (state.phase === 'setup') {
    return (
      <WirexSetup
        title={title}
        initialUser={state.user}
        initialCards={state.cards}
        onReady={(user, cards) => setState(toState(user, cards))}
      />
    )
  }

  return <WirexCardHome user={state.user} card={state.card} />
}
