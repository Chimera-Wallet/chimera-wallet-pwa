import { useContext } from 'react'
import { getPosSettings } from '../../../lib/pos'
import { NavigationContext, Pages } from '../../../providers/navigation'
import PayoutSetup from './PayoutSetup'
import PosTerminal from './Terminal'
import PosWelcome from './Welcome'

/**
 * POS app entry: the terminal once set up, otherwise the welcome page, which
 * continues into the payout setup page. Finishing that returns here, where the
 * now-saved settings show the terminal.
 */
export default function AppPos() {
  const { navigate } = useContext(NavigationContext)

  if (getPosSettings().onboarded) return <PosTerminal />

  return <PosWelcome onBack={() => navigate(Pages.Apps)} onContinue={() => navigate(Pages.AppPosPayout)} />
}

/** Payout currency / bank account setup — from onboarding, the terminal or POS settings. */
export function AppPosPayout() {
  const { goBack, navigationData } = useContext(NavigationContext)
  return <PayoutSetup editBank={navigationData?.step === 'bank'} onBack={goBack} onDone={goBack} />
}
