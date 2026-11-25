/**
 * Keeps eSIM orders moving in the background, whatever screen is showing:
 * reports payments ramp hasn't been told about yet (offline, app closed
 * mid-way) and collects links of orders still being delivered. Does nothing
 * when no order needs it. Listing every order from ramp by wallet key (for a
 * restored wallet) happens when the eSIM app opens, not here.
 */

import { useContext, useEffect, useRef } from 'react'
import { WalletContext } from './wallet'
import { esimNeedsSync, getStoredEsims, syncEsims } from '../lib/esims'
import { consoleError } from '../lib/logs'

const SYNC_INTERVAL_MS = 60_000

export default function EsimSync() {
  const { initialized, dataReady, txs } = useContext(WalletContext)
  const txsRef = useRef(txs)
  txsRef.current = txs

  useEffect(() => {
    if (!initialized || !dataReady) return
    const run = () => {
      if (!getStoredEsims().some((esim) => esimNeedsSync(esim))) return
      syncEsims({ txs: txsRef.current, listFromServer: false }).catch((err) => consoleError(err, 'eSIM sync failed'))
    }
    run()
    const timer = setInterval(run, SYNC_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [initialized, dataReady])

  return null
}
