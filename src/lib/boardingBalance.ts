/**
 * Keeps a just-boarded deposit from being counted twice in the wallet total.
 *
 * The SDK's balance adds the boarding UTXOs the on-chain explorer still lists
 * as unspent to the wallet's VTXOs. When a deposit boards, its VTXO arrives
 * (from the Ark server) as soon as the batch finalises, but the explorer only
 * marks the boarding UTXO spent once it has indexed the commitment tx that
 * spends it — seconds later, sometimes longer. A balance read in between counts
 * the deposit twice: 50 + a 100 deposit showed 250 instead of 150.
 *
 * The window is detectable: a recent batch VTXO whose commitment tx the
 * explorer hasn't indexed yet. Until it has, the explorer's view of which
 * confirmed boarding UTXOs are unspent can't be trusted, so the total leaves
 * them out. Only confirmed ones: both boarding paths (WalletContext's
 * boardDeposits and the SDK's periodic settle) board every confirmed deposit,
 * and an unconfirmed one can't have boarded. Once the explorer catches up the
 * SDK's figure is used as-is again.
 */

import type { ExtendedVirtualCoin } from '@arkade-os/sdk'

// Batch outputs older than this predate any lag worth correcting for.
const RECENT_BATCH_MS = 10 * 60 * 1000
const EXPLORER_TIMEOUT_MS = 10_000

// Commitment txids the explorer has been seen to know. Once indexed a tx stays
// indexed, so each is looked up at most until it first appears.
const indexed = new Set<string>()

/** Whether the explorer has indexed `txid`; undefined when it couldn't be asked. */
const explorerKnowsTx = async (explorerUrl: string, txid: string): Promise<boolean | undefined> => {
  if (indexed.has(txid)) return true
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), EXPLORER_TIMEOUT_MS)
  try {
    const res = await fetch(`${explorerUrl}/tx/${txid}/status`, { signal: controller.signal })
    if (res.ok) {
      indexed.add(txid)
      return true
    }
    return res.status === 404 ? false : undefined
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

/** Commitment txids of recent batch VTXOs that the explorer hasn't indexed yet. */
export const unindexedRecentCommitments = async (
  vtxos: ExtendedVirtualCoin[],
  explorerUrl: string,
  now = Date.now(),
): Promise<string[]> => {
  const candidates = new Set<string>()
  for (const vtxo of vtxos) {
    // Preconfirmed VTXOs come from offchain txs, never from boarding
    if (vtxo.isPreconfirmed) continue
    if (now - new Date(vtxo.createdAt).getTime() > RECENT_BATCH_MS) continue
    for (const txid of vtxo.commitmentTxIds ?? []) candidates.add(txid)
  }
  const unindexed: string[] = []
  await Promise.all(
    [...candidates].map(async (txid) => {
      if ((await explorerKnowsTx(explorerUrl, txid)) === false) unindexed.push(txid)
    }),
  )
  return unindexed
}

export interface BoardingAwareTotal {
  total: number
  /** True while the explorer lags a batch, so the total should be re-read soon. */
  lagging: boolean
}

/**
 * The wallet total with confirmed boarding UTXOs left out while the explorer
 * lags a recent batch (see above). Unchanged when there is nothing confirmed
 * to board or the explorer can't be asked.
 */
export const boardingAwareTotal = async (
  balance: { total: number; boarding?: { confirmed: number } },
  vtxos: ExtendedVirtualCoin[],
  explorerUrl: string | undefined,
  now = Date.now(),
): Promise<BoardingAwareTotal> => {
  const confirmedBoarding = balance.boarding?.confirmed ?? 0
  if (!explorerUrl || confirmedBoarding <= 0) return { total: balance.total, lagging: false }
  const unindexed = await unindexedRecentCommitments(vtxos, explorerUrl, now)
  if (unindexed.length === 0) return { total: balance.total, lagging: false }
  return { total: balance.total - confirmedBoarding, lagging: true }
}

/** Test hook: forget which commitment txids were seen indexed. */
export const resetIndexedCommitments = (): void => indexed.clear()
