import type { PriceSeries } from '../hooks/useHistoricalPrices'
import { ASSETS, ASSET_LIST, getWrappedAssetId, requireAssetConfig } from './assets'
import type { Tx } from './types'

/** How swaps (and so this module) name BTC; wrapped assets go by Arkade asset id. */
export const BTC_KEY = 'btc'

export interface AssetDelta {
  key: string
  /** base units: sats for BTC, raw asset units otherwise */
  amount: number
}

/** How a tx row moved each asset the wallet holds, in base units.
 *
 * - BTC: `amount` is unsigned, so `type` gives the direction.
 * - Wrapped assets: the SDK already signs `assets` amounts (a send is change
 *   minus spent, so negative; a receive is positive).
 * - A swap row stands in for the txs that funded and filled it, so both legs
 *   come from the swap: the from side leaves once funded (unless the swap was
 *   cancelled and refunded), and the to side arrives only once completed. */
export const txDeltas = (tx: Tx): AssetDelta[] => {
  if (tx.type === 'swap') {
    const swap = tx.assetSwap
    if (!swap) return []
    const deltas: AssetDelta[] = []
    if (swap.status !== 'cancelled') deltas.push({ key: swap.fromAssetId, amount: -Number(swap.fromAmount) })
    if (swap.status === 'completed') deltas.push({ key: swap.toAssetId, amount: Number(swap.toAmount) })
    return deltas
  }
  const sign = tx.type === 'sent' ? -1 : tx.type === 'received' ? 1 : 0
  const deltas: AssetDelta[] = sign && tx.amount ? [{ key: BTC_KEY, amount: sign * tx.amount }] : []
  for (const asset of tx.assets ?? []) deltas.push({ key: asset.assetId, amount: Number(asset.amount) })
  return deltas
}

export interface HeldAsset {
  symbol: string
  key: string
  decimals: number
  /** current balance, base units */
  current: number
}

/** The listed assets that belong in the wallet's value history: those with a
 * price source that the wallet holds now or has moved at some point. BTC is
 * always included so the chart has a timeline even for an empty wallet. */
export const heldAssets = (
  btcSats: number,
  assetBalances: { assetId: string; amount: bigint }[],
  txs: Tx[],
): HeldAsset[] => {
  const moved = new Set(txs.flatMap((tx) => txDeltas(tx).map((d) => d.key)))
  const held: HeldAsset[] = []
  for (const asset of ASSET_LIST) {
    if (asset.noMarketData) continue
    if (asset.symbol === ASSETS.BTC.symbol) {
      held.push({ symbol: asset.symbol, key: BTC_KEY, decimals: asset.precision, current: btcSats })
      continue
    }
    const key = getWrappedAssetId(asset.symbol)
    if (!key) continue
    const current = Number(assetBalances.find((b) => b.assetId === key)?.amount ?? 0)
    // CX wrapped assets map 1-to-1 with the original, so raw amounts use the
    // original asset's precision (as the home asset list does)
    if (current > 0 || moved.has(key))
      held.push({ symbol: asset.symbol, key, decimals: requireAssetConfig(asset.symbol).precision, current })
  }
  return held
}

/** Price at `at`: the last point at or before it, else the first point. */
const priceAt = (prices: PriceSeries, at: number): number => {
  let lo = 0
  let hi = prices.length - 1
  if (hi < 0) return 0
  if (prices[0][0] >= at) return prices[0][1]
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (prices[mid][0] <= at) lo = mid
    else hi = mid - 1
  }
  return prices[lo][1]
}

/** The wallet's combined value in fiat over time, `[timestampMs, value]`.
 *
 * For each asset, starts from its current balance and walks the tx history
 * backwards, undoing each tx newer than the point, then prices what was held at
 * that moment. Plotted on the timeline of the asset with the densest prices.
 * `prices` are `[timestampMs, fiatPerUnit]`, oldest first (CoinGecko's order). */
export const walletValueHistory = (
  assets: (HeldAsset & { prices: PriceSeries })[],
  txs: Tx[],
): [number, number][] => {
  const timeline = assets.reduce<PriceSeries>((best, a) => (a.prices.length > best.length ? a.prices : best), [])
  const values = timeline.map(([at]) => [at, 0] as [number, number])

  // createdAt 0 marks a tx not yet in a block; it's already in the balance
  const deltas = txs
    .flatMap((tx) => txDeltas(tx).map((d) => ({ ...d, at: tx.createdAt ? tx.createdAt * 1000 : Infinity })))
    .sort((a, b) => b.at - a.at)

  for (const asset of assets) {
    const own = deltas.filter((d) => d.key === asset.key)
    let units = asset.current
    let next = 0
    for (let i = timeline.length - 1; i >= 0; i--) {
      const at = timeline[i][0]
      while (next < own.length && own[next].at > at) units -= own[next++].amount
      values[i][1] += (Math.max(0, units) / 10 ** asset.decimals) * priceAt(asset.prices, at)
    }
  }
  return values
}
