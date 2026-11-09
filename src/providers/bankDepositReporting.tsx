/**
 * Reports bank withdrawal funding txids the provider hasn't been told about
 * yet, in the background whatever screen is showing.
 *
 * Ramp shares one deposit address across all its off-ramp orders and only
 * credits a deposit once the wallet reports which transaction paid it. A
 * report that failed (offline, app closed mid-way) stays listed in
 * lib/bankDepositReports; this retries the list on start and then
 * periodically. A no-op on the legacy Chimera provider, which has no such call.
 */

import { useEffect } from 'react'
import { retryUnreportedBankDeposits } from '../lib/bankWithdrawalFlow'
import { getBankTransferProvider } from './bankTransfer'

const RETRY_INTERVAL_MS = 2 * 60_000

export default function BankDepositReporting() {
  useEffect(() => {
    if (getBankTransferProvider() !== 'ramp') return
    // Cheap when nothing is listed: it reads the list and stops.
    retryUnreportedBankDeposits()
    const timer = setInterval(retryUnreportedBankDeposits, RETRY_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [])

  return null
}
