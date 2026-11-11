// Top up the Wirex card from Chimera (Ark) balances.
//
// The card spends from the Wirex unified balance (WUSD on Base), which Wirex
// mints 1:1 when USDC/USDT lands on the user's Wirex smart wallet. So a top-up
// is: Ark USDT-CX --Arkade Wrap unwrap--> USDT on Base, paid to the Wirex
// wallet --Wirex--> WUSD.
//
//   1. fundWirexTopUp: reserve/refresh an unwrap quote and fund its treasury.
//   2. trackWirexTopUp: poll the quote until paid out, then poll the Wirex
//      wallet until WUSD rises above the pre-top-up balance.
//
// Pending top-ups are kept in localStorage so the card home can resume
// tracking after the app is closed, and so a funded quote is never funded twice.
// No React in here, so it can be unit tested directly.

import type { IWallet } from '@arkade-os/sdk'
import { createUnwrapQuote, getWrapQuote, isTerminalWrapStatus, type WrapQuote } from '../../../lib/arkadeWrap'
import { sendAssets } from '../../../lib/asp'
import { getWrappedAssetId, type AssetSymbol } from '../../../lib/assets'
import { getWirexDepositChain } from '../../../lib/sourceChains'
import { getWirexWallet } from '../../../lib/wirex'
import { isWirexEnabled } from '../../../providers/wirex'
import { NotImplementedError, getWirexCardBalance } from './lib'

export const isWirexTopUpEnabled = (): boolean =>
  isWirexEnabled() && import.meta.env.VITE_WIREX_TOPUP_ENABLED === 'true'

// Sources

export interface TopUpSource {
  symbol: AssetSymbol
  /**
   * Whether the asset must first be swapped into the bridge asset (USDT) via
   * the solver. PLACEHOLDER: no source needs it yet; the swap leg will wrap
   * providers/assetSwaps.tsx createSwap and wait for the fill.
   */
  needsSwap: boolean
}

export const TOP_UP_SOURCES: TopUpSource[] = [{ symbol: 'USDT', needsSwap: false }]

/** Ticker Arkade Wrap pays out on the deposit chain (USDT-CX is unwrapped to USDT). */
const BRIDGE_TICKER = 'USDT'

export const requireTopUpSource = (symbol: string): TopUpSource => {
  const source = TOP_UP_SOURCES.find((s) => s.symbol === symbol)
  if (!source) throw new Error(`${symbol} can't be used to top up the card`)
  if (source.needsSwap) throw new NotImplementedError(`Topping up from ${symbol}`)
  return source
}

// Quotes

export class TopUpBelowMinimumError extends Error {
  constructor(readonly minAmount: bigint) {
    super('Amount is below the bridge minimum')
    this.name = 'TopUpBelowMinimumError'
  }
}

export const minAmountOf = (quote?: WrapQuote): bigint => (quote?.min_amount ? BigInt(quote.min_amount) : BigInt(0))

/**
 * What lands on the Wirex wallet (and so becomes WUSD 1:1) for a deposit of
 * `amount`: the bridge takes its percentage fee and a fixed network fee.
 */
export const estimateTopUpPayout = (
  amount: bigint,
  quote: WrapQuote | undefined,
  serviceFeePercent: number,
): bigint => {
  if (amount <= BigInt(0)) return BigInt(0)
  // basis points keep the percentage in integer maths
  const feeBps = BigInt(Math.round(serviceFeePercent * 100))
  const fee = (amount * feeBps + BigInt(9_999)) / BigInt(10_000)
  const networkFee = quote?.network_fee_amount ? BigInt(quote.network_fee_amount) : BigInt(0)
  const payout = amount - fee - networkFee
  return payout > BigInt(0) ? payout : BigInt(0)
}

const sameAddress = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Whether a quote can still be funded: pending, unexpired, nothing deposited. */
export const isFundableQuote = (quote: WrapQuote, receiver: string, now = Date.now()): boolean =>
  quote.status === 'pending' && !quote.deposit_tx_hash && quote.expiry > now && sameAddress(quote.receiver, receiver)

/** Reserve an unwrap quote paying USDT on the deposit chain to the Wirex wallet. */
export const createTopUpQuote = (sender: string, receiver: string): Promise<WrapQuote> =>
  createUnwrapQuote({ chain: getWirexDepositChain().id, ticker: BRIDGE_TICKER, sender, receiver })

export interface FundTopUpParams {
  wallet: IWallet
  /** The user's Ark address (the quote's sender). */
  sender: string
  /** The Wirex smart wallet address on the deposit chain. */
  receiver: string
  symbol: AssetSymbol
  /** Base units of the Ark asset. */
  amount: bigint
  /** Quote reserved earlier (e.g. to show the minimum); refreshed before use. */
  quote?: WrapQuote
}

export interface FundTopUpResult {
  quote: WrapQuote
  /** Undefined when the quote had already been funded — nothing was sent. */
  txid?: string
}

/**
 * Fund a top-up. Refreshes `quote` (or makes a new one if it's missing, expired
 * or for another receiver), checks the minimum, then sends the Ark asset to the
 * quote's treasury. A quote that already saw a deposit is returned unfunded, so
 * a retry can never pay twice.
 */
export const fundWirexTopUp = async ({
  wallet,
  sender,
  receiver,
  symbol,
  amount,
  quote,
}: FundTopUpParams): Promise<FundTopUpResult> => {
  requireTopUpSource(symbol)
  const assetId = getWrappedAssetId(symbol)
  if (!assetId) throw new Error(`No asset id configured for ${symbol}`)
  if (amount <= BigInt(0)) throw new Error('Amount must be greater than zero')

  let current = quote ? await getWrapQuote(quote.id) : undefined
  if (current && (current.deposit_tx_hash || (current.status !== 'pending' && current.status !== 'expired'))) {
    return { quote: current }
  }
  if (!current || !isFundableQuote(current, receiver)) current = await createTopUpQuote(sender, receiver)
  if (!isFundableQuote(current, receiver)) throw new Error('The bridge quote is no longer valid, please try again')

  const minAmount = minAmountOf(current)
  if (amount < minAmount) throw new TopUpBelowMinimumError(minAmount)

  // The bridge derives the payout from what is deposited, not from the quote.
  const txid = await sendAssets(wallet, current.treasury, [{ assetId, amount }])
  if (!txid) throw new Error('The transfer to the bridge failed')
  return { quote: current, txid }
}

// Pending top-ups (localStorage)

export type TopUpPhase = 'bridging' | 'crediting' | 'credited' | 'failed' | 'timeout'

export interface PendingTopUp {
  quoteId: string
  /** Ark funding txid. */
  txid: string
  userAddress: string
  symbol: AssetSymbol
  /** Base units, as a decimal string. */
  amount: string
  /** WUSD card balance before the top-up; credit is detected as a rise above it. */
  baselineWusd: number
  createdAt: number
  phase: TopUpPhase
  payoutTxHash?: string
}

const PENDING_KEY = 'wirexPendingTopUps'

const readAll = (): PendingTopUp[] => {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeAll = (list: PendingTopUp[]) => {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list))
  } catch {
    // non-fatal: tracking just won't survive a reload
  }
}

/** Top-ups for this user that are still in flight. */
export const readPendingTopUps = (userAddress: string): PendingTopUp[] =>
  readAll().filter(
    (p) => sameAddress(p.userAddress, userAddress) && (p.phase === 'bridging' || p.phase === 'crediting'),
  )

export const savePendingTopUp = (topUp: PendingTopUp) =>
  writeAll([...readAll().filter((p) => p.quoteId !== topUp.quoteId), topUp])

export const removePendingTopUp = (quoteId: string) => writeAll(readAll().filter((p) => p.quoteId !== quoteId))

// Tracking

export const BRIDGE_POLL_MS = 8_000
export const CREDIT_POLL_MS = 15_000
/** Give up waiting (and show "still processing") after this long without a credit. */
export const CREDIT_TIMEOUT_MS = 10 * 60_000

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })

export interface TrackOptions {
  signal?: AbortSignal
  onUpdate?: (topUp: PendingTopUp) => void
  bridgePollMs?: number
  creditPollMs?: number
  creditTimeoutMs?: number
}

/**
 * Follow a funded top-up to the end: bridge payout, then the WUSD credit.
 * Persists every phase change. Resolves with the final state (`credited`,
 * `failed` or `timeout`); rejects only with an AbortError when `signal` fires.
 * Transient polling errors are swallowed and retried.
 */
export const trackWirexTopUp = async (start: PendingTopUp, opts: TrackOptions = {}): Promise<PendingTopUp> => {
  const { signal, onUpdate } = opts
  const bridgePollMs = opts.bridgePollMs ?? BRIDGE_POLL_MS
  const creditPollMs = opts.creditPollMs ?? CREDIT_POLL_MS
  const creditTimeoutMs = opts.creditTimeoutMs ?? CREDIT_TIMEOUT_MS

  let topUp = start
  const update = (changes: Partial<PendingTopUp>) => {
    topUp = { ...topUp, ...changes }
    savePendingTopUp(topUp)
    onUpdate?.(topUp)
  }
  // Persist up front, so a top-up is resumable even if the caller didn't save it.
  if (topUp.phase === 'bridging' || topUp.phase === 'crediting') savePendingTopUp(topUp)

  while (topUp.phase === 'bridging') {
    try {
      const quote = await getWrapQuote(topUp.quoteId)
      if (quote.status === 'completed') update({ phase: 'crediting', payoutTxHash: quote.payout_tx_hash ?? undefined })
      else if (isTerminalWrapStatus(quote.status)) update({ phase: 'failed' })
    } catch {
      // transient: try again next tick
    }
    if (topUp.phase === 'bridging') await sleep(bridgePollMs, signal)
  }

  const creditStart = Date.now()
  while (topUp.phase === 'crediting') {
    try {
      const balance = getWirexCardBalance(await getWirexWallet(topUp.userAddress))
      if (balance > topUp.baselineWusd) {
        update({ phase: 'credited' })
        break
      }
    } catch {
      // transient: try again next tick
    }
    if (Date.now() - creditStart >= creditTimeoutMs) {
      // Keep it stored as crediting so the card home keeps checking; report
      // the timeout to the caller only.
      const timedOut = { ...topUp, phase: 'timeout' as const }
      onUpdate?.(timedOut)
      return timedOut
    }
    await sleep(creditPollMs, signal)
  }

  if (topUp.phase === 'credited' || topUp.phase === 'failed') removePendingTopUp(topUp.quoteId)
  return topUp
}
