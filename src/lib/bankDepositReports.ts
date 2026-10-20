/**
 * Funding txids of bank withdrawals whose report to the provider hasn't got
 * through yet. Ramp shares one deposit address across all its off-ramp orders,
 * so it only credits a deposit once told which transaction paid it
 * (providers/bankTransfer::reportBankWithdrawalFunding). The single pending
 * slot (lib/bankWithdrawalAttempt) is overwritten by the next withdrawal, so a
 * txid kept only there could be lost — this list keeps every one until it has
 * been reported (lib/bankWithdrawalFlow::retryUnreportedBankDeposits).
 */

export interface UnreportedBankDeposit {
  orderId: string
  txid: string
  createdAt: number
}

const STORAGE_KEY = 'unreported_bank_deposits'

// An order still waiting after this long has long expired on the provider's
// side; the entry is only noise by then.
export const UNREPORTED_DEPOSIT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

const isEntry = (value: unknown): value is UnreportedBankDeposit => {
  const entry = value as UnreportedBankDeposit
  return (
    typeof entry?.orderId === 'string' &&
    entry.orderId.length > 0 &&
    typeof entry.txid === 'string' &&
    entry.txid.length > 0 &&
    Number.isFinite(entry.createdAt)
  )
}

const read = (): UnreportedBankDeposit[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed.filter(isEntry) : []
  } catch {
    return []
  }
}

// Never throws: these are written right after funds have left the wallet, and a
// full or broken localStorage must not make that payment look failed.
const write = (entries: UnreportedBankDeposit[]): void => {
  try {
    if (entries.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // nothing more to do; the pending slot still holds the latest txid
  }
}

/** Entries still to report, oldest first. Ones past the max age are dropped. */
export const getUnreportedBankDeposits = (now = Date.now()): UnreportedBankDeposit[] => {
  const entries = read()
  const fresh = entries.filter((e) => now - e.createdAt <= UNREPORTED_DEPOSIT_MAX_AGE_MS)
  if (fresh.length !== entries.length) write(fresh)
  return fresh
}

export const hasUnreportedBankDeposit = (orderId: string): boolean =>
  getUnreportedBankDeposits().some((e) => e.orderId === orderId)

/** Record a funding txid to report. Keeps an existing entry for the order as it is. */
export const addUnreportedBankDeposit = (orderId: string, txid: string): void => {
  const entries = getUnreportedBankDeposits()
  if (entries.some((e) => e.orderId === orderId)) return
  write([...entries, { orderId, txid, createdAt: Date.now() }])
}

export const removeUnreportedBankDeposit = (orderId: string): void => {
  const entries = read()
  const remaining = entries.filter((e) => e.orderId !== orderId)
  if (remaining.length !== entries.length) write(remaining)
}
