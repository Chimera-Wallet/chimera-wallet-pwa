/**
 * Keeps bridge (Arkade Wrap) deposits current in the background, whatever
 * screen is showing, so the transaction list can show a deposit as pending
 * until the minted asset arrives — even after the user left the receive
 * screen. The receive screen reads the same store instead of polling itself.
 * See lib/wrapDeposits.
 */

import { useEffect } from 'react'
import { refreshWrapDeposits } from '../lib/wrapDeposits'

const POLL_INTERVAL_MS = 8000

export default function WrapDepositTracking() {
  useEffect(() => {
    // Cheap when nothing is in flight: it reads the list and stops.
    refreshWrapDeposits()
    const timer = setInterval(refreshWrapDeposits, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])

  return null
}
