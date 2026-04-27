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
