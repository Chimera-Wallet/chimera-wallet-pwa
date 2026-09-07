import type { ArkTransaction } from '@arkade-os/sdk'
import type { Tx } from './types'

/** The key `activitiesToTxs` buckets untagged rows on, and the one the swap
 * resolver correlates against. */
export const txidOfArkTransaction = (tx: ArkTransaction): string =>
  tx.key.arkTxid || tx.key.commitmentTxid || tx.key.boardingTxid

export const arkTransactionToTx = (tx: ArkTransaction): Tx => {
  const date = new Date(tx.createdAt)
  const unix = Math.floor(date.getTime() / 1000)
  const { key, settled, type, amount } = tx
  const explorable = key.boardingTxid ? key.boardingTxid : key.commitmentTxid ? key.commitmentTxid : undefined
  const assets = tx.assets?.map((a) => ({ assetId: a.assetId, amount: a.amount }))
  const isSentTx = type === 'SENT'
  return {
    amount: Math.abs(amount),
    assets,
    boardingTxid: key.boardingTxid,
    redeemTxid: key.arkTxid,
    roundTxid: key.commitmentTxid,
    createdAt: unix,
    explorable,
    preconfirmed: !(isSentTx ? true : settled),
    settled: isSentTx ? true : settled, // show all sent tx as settled
    type: type.toLowerCase(),
  }
}

export const sortLocalTxs = (txs: Tx[]): Tx[] =>
  [...txs].sort((a, b) => {
    if (a.createdAt === b.createdAt) return a.type === 'sent' ? -1 : 1
    if (b.createdAt === 0) return 1 
    if (a.createdAt === 0) return -1
    return a.createdAt > b.createdAt ? -1 : 1
  })
