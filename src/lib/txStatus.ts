import { Tx } from './types'

export type TxStatus = 'Expired' | 'Unconfirmed' | 'Pending boarding' | 'Settled' | 'Preconfirmed'

export const getTxStatus = (tx: Tx, boardingExitDelay: number): TxStatus => {
  const boardingTx = Boolean(tx.boardingTxid)
  const unconfirmedBoardingTx = boardingTx && !tx.createdAt
  const expiredBoardingTx =
    !tx.settled && boardingTx && tx.createdAt && Date.now() / 1000 - tx.createdAt > boardingExitDelay

  if (expiredBoardingTx) return 'Expired'
  if (unconfirmedBoardingTx) return 'Unconfirmed'
  if (boardingTx && tx.preconfirmed) return 'Pending boarding'
  if (tx.settled) return 'Settled'
  return 'Preconfirmed'
}

// Chimera's user-facing statuses. Users only ever see Confirmed / Pending /
// Failed, never Arkade's Settled / Preconfirmed / Pending boarding. Shared by
// the transaction list and the detail screen so the two can't drift apart.
// `text` is an i18n key.
export const TX_STATUS_DISPLAY: Record<TxStatus, { text: string; color: string }> = {
  Settled: { text: 'lib.transactions.confirmed', color: 'var(--green)' },
  Preconfirmed: { text: 'lib.transactions.confirmed', color: 'var(--green)' },
  'Pending boarding': { text: 'lib.transactions.pending', color: 'var(--orange)' },
  Unconfirmed: { text: 'lib.transactions.pending', color: 'var(--orange)' },
  Expired: { text: 'lib.transactions.failed', color: 'var(--red)' },
}
