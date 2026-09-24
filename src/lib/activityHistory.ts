import type { Activity, IWallet } from '@arkade-os/sdk'
import { ASSET_SWAP_ACTIVITY_KIND } from './activity/assetSwapResolver'
import { consoleError } from './logs'
import { buildAssetSwapActivityTx } from './swapDisplay'
import type { WalletAssetSwap } from './swapRepository'
import { arkTransactionToTx, sortLocalTxs, txidOfArkTransaction } from './transactionHistory'
import type { Tx } from './types'

const swapIdOf = (activity: Activity): string | undefined =>
  activity.intent?.kind === ASSET_SWAP_ACTIVITY_KIND
    ? (activity.intent.metadata?.swapId as string | undefined)
    : undefined

/** `Activity[]` -> the `Tx[]` the UI already reads.
 *
 * Only a swap group is collapsed into one row; everything else emits one row
 * per member tx. */
export const activitiesToTxs = (activities: Activity[], swaps: WalletAssetSwap[]): Tx[] => {
  const rows: Tx[] = []
  for (const activity of activities) {
    const swapId = swapIdOf(activity)
    const swap = swapId ? swaps.find((record) => record.id === swapId) : undefined
    if (swap) {
      const members = activity.txs.map((tx) => arkTransactionToTx(tx))
      rows.push(buildAssetSwapActivityTx(swap, members))
      continue
    }
    for (const tx of activity.txs) rows.push(arkTransactionToTx(tx))
  }
  return sortLocalTxs(rows)
}

export const getActivities = async (wallet: IWallet): Promise<Activity[]> => {
  try {
    return await wallet.getActivityHistory()
  } catch (err) {
    consoleError(err, 'error getting activity history')
    return []
  }
}

// re-exported so callers correlating a swap's txids don't need a second import
export { txidOfArkTransaction }
