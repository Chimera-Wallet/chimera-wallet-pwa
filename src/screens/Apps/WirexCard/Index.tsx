// Card tab when VITE_WIREX_ENABLED is 'true' (see providers/navigation.tsx);
// otherwise the tab keeps showing ../CardReservation.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Header from '../../../components/Header'
import Content from '../../../components/Content'
import Loading from '../../../components/Loading'
import { WirexCard, WirexUser, getWirexCards, getWirexUserByAddress } from '../../../lib/wirex'
import { getSelectableCards, readWirexAddress } from '../../../lib/wirexCard'
import WirexSetup from './Setup'
import WirexCardHome from './CardHome'
import WirexWalkthrough from './Walkthrough'

type State =
  | { phase: 'loading' }
  | { phase: 'setup'; user: WirexUser | null; cards: WirexCard[] }
  | { phase: 'home'; user: WirexUser; cards: WirexCard[] }

const toState = (user: WirexUser | null, cards: WirexCard[]): State => {
  const selectable = getSelectableCards(cards)
  return user && selectable.length ? { phase: 'home', user, cards: selectable } : { phase: 'setup', user, cards }
}

export default function AppWirexCard() {
  const { t } = useTranslation()
  const [state, setState] = useState<State>({ phase: 'loading' })
  const [walkthroughDone, setWalkthroughDone] = useState(false)

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
    if (!walkthroughDone) return <WirexWalkthrough onDone={() => setWalkthroughDone(true)} />
    return (
      <WirexSetup
        title={title}
        onInfo={() => setWalkthroughDone(false)}
        initialUser={state.user}
        initialCards={state.cards}
        onReady={(user, cards) => setState(toState(user, cards))}
      />
    )
  }

  return <WirexCardHome user={state.user} cards={state.cards} />
}
