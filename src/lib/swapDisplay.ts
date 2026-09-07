import { getAssetConfig, getAssetSymbolByAssetId, getDisplayTicker } from './assets'
import type { WalletAssetSwap } from './swapRepository'
import type { Tx, TxAssetSwap } from './types'

export type SwapStatus = TxAssetSwap['status']

export function swapStatusForTx(tx: Tx): SwapStatus {
  return tx.assetSwap?.status ?? (tx.settled ? 'completed' : 'pending')
}

export function swapStatusLabel(tx: Tx): string {
  const status = swapStatusForTx(tx)
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'recoverable') return 'Recoverable'
  if (status === 'pending') return 'Pending'
  return 'Completed'
}

export function swapRouteTicker(assetId: string | undefined, ticker: string | undefined): string | undefined {
  return assetId === 'btc' ? 'BTC' : (ticker ?? assetId)
}

export function swapRouteLabel(tx: Tx): string {
  return [
    { assetId: tx.assetSwap?.fromAssetId, ticker: tx.assetSwap?.fromTicker },
    { assetId: tx.assetSwap?.toAssetId, ticker: tx.assetSwap?.toTicker },
  ]
    .map(({ assetId, ticker }) => swapRouteTicker(assetId, ticker))
    .filter(Boolean)
    .join(' to ')
}


const derivedTicker = (assetId: string): string => {
  if (assetId === 'btc') return 'BTC'
  const symbol = getAssetSymbolByAssetId(assetId)
  return symbol ? getDisplayTicker(symbol) : assetId.slice(0, 8)
}
const derivedDecimals = (assetId: string): number => {
  if (assetId === 'btc') return 8
  const symbol = getAssetSymbolByAssetId(assetId)
  return (symbol && getAssetConfig(symbol)?.precision) ?? 8
}

/** The display row for one swap, from its record and the wallet rows that
 * funded and filled it. Facts are recomputed from the tx couple where
 * possible; the quote snapshot only fills what cannot be (fee, fiat). */
export const buildAssetSwapActivityTx = (swap: WalletAssetSwap, members: Tx[]): Tx => {
  const quote = swap.quote
  const status: SwapStatus =
    swap.status === 'fulfilled'
      ? 'completed'
      : swap.status === 'cancelled'
        ? 'cancelled'
        : swap.status === 'recoverable'
          ? 'recoverable'
          : 'pending'
  const fill = swap.spentTxid
    ? members.find((tx) => [tx.boardingTxid, tx.redeemTxid, tx.roundTxid].includes(swap.spentTxid as string))
    : undefined
  const receivedAsset = fill?.assets?.find((asset) => asset.assetId === swap.toAsset && asset.amount > BigInt(0))
  const receivedAmount =
    swap.toAsset === 'btc' && fill?.amount && fill.amount > 0
      ? BigInt(fill.amount)
      : (receivedAsset?.amount ?? BigInt(swap.toAmount))
  return {
    amount: members[0]?.amount ?? 0,
    boardingTxid: '',
    createdAt: Math.floor(swap.createdAt / 1000),
    explorable: undefined,
    preconfirmed: status === 'pending',
    redeemTxid: swap.spentTxid ?? swap.fundingTxid,
    roundTxid: '',
    settled: status !== 'pending',
    type: 'swap',
    assetSwap: {
      fromAssetId: swap.fromAsset,
      fromTicker: quote?.fromTicker ?? derivedTicker(swap.fromAsset),
      fromDecimals: quote?.fromDecimals ?? derivedDecimals(swap.fromAsset),
      fromAmount: BigInt(swap.fromAmount),
      toAssetId: swap.toAsset,
      toTicker: quote?.toTicker ?? derivedTicker(swap.toAsset),
      toDecimals: quote?.toDecimals ?? derivedDecimals(swap.toAsset),
      toAmount: receivedAmount,
      fiatAmount: quote?.fromFiatAmount,
      fiatCurrency: quote?.fiatCurrency,
      feeBps: quote?.feeBps,
      status,
    },
  }
}

/**
 * The fiat amount shown on a swap row. Prefers the quote-time snapshot (a
 * BTC-deposit swap always has one); a restored or asset-to-asset swap has
 * none, so it's valued off whichever leg is BTC, at today's rate — the same
 * fallback the live composer uses for BTC amounts elsewhere.
 */
export function swapFiatAmount(tx: Tx, toFiat: (satoshis: number) => number): number | undefined {
  const swap = tx.assetSwap
  if (!swap) return undefined
  if (swap.fiatAmount !== undefined) return swap.fiatAmount
  const btcSats =
    swap.fromAssetId === 'btc' ? swap.fromAmount : swap.toAssetId === 'btc' ? swap.toAmount : undefined
  if (btcSats === undefined || btcSats <= BigInt(0)) return undefined
  return toFiat(Number(btcSats))
}
