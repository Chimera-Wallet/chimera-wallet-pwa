// Arkade Wrap (Typhoon) API client.
//
// Typhoon is a custodial bridge between EVM/TRON chains and Arkade. Clients
// request a quote (wrap or unwrap), deposit funds to the returned treasury
// address, and poll the quote until it reaches the `completed` state.
//
// Wrap:   deposit native/token on a source chain (sender) -> receive the
//         equivalent Arkade-native asset (receiver = Arkade address).
// Unwrap: deposit the wrapped Arkade asset (sender = Arkade address) -> receive
//         the underlying native/token on the destination chain (receiver).
//
// Docs: https://api.arkadewrap.com/docs/  (spec: /docs/openapi.json)

import type { SourceChainId } from './sourceChains'
import { BALANCE_DISPLAY_DECIMALS, getAssetConfig, prettyAssetAmount } from './assets'

export const getArkadeWrapBaseUrl = (): string => {
  const url = import.meta.env.VITE_ARKADEWRAP_API
  if (!url) throw new Error('VITE_ARKADEWRAP_API is not set')
  return url
}

export const SERVICE_FEE_PERCENT = 0.3

/** Parse an optional quote amount, in the asset's base units (see normalizeQuoteLimits). */
export const quoteBaseUnits = (value: string | null | undefined): bigint => (value ? BigInt(value) : BigInt(0))

const BRIDGE_LIMIT_DECIMALS = 18
const WRAPPED_TICKER_SUFFIX = '-CX'

const tickerPrecision = (ticker: string): number | undefined => {
  const upper = ticker.toUpperCase()
  const base = upper.endsWith(WRAPPED_TICKER_SUFFIX) ? upper.slice(0, -WRAPPED_TICKER_SUFFIX.length) : upper
  return getAssetConfig(base)?.precision
}

/**
 * Rewrite the limit fields of a quote into the asset base units (independent of the scale decided by the bridge). 
 * Scale is read off the limit itself e.g: 18-decimal limit is just a multiple of 
 * 10^(18-precision) but as a base-unit this would be a crazy limit (as seen in screenshots). 
 */
export const normalizeQuoteLimits = (quote: WrapQuote): WrapQuote => {
  const precision = tickerPrecision(quote.ticker ?? '')
  if (precision === undefined) return quote
  const shift = BRIDGE_LIMIT_DECIMALS - precision
  if (shift <= 0) return quote
  const step = BigInt(10) ** BigInt(shift)
  const probe = quoteBaseUnits(quote.min_amount) || quoteBaseUnits(quote.network_fee_amount)
  if (probe === BigInt(0) || probe % step !== BigInt(0)) return quote
  const convert = (value: string | null | undefined): string | null | undefined =>
    value ? ((BigInt(value) + step - BigInt(1)) / step).toString() : value
  return {
    ...quote,
    min_amount: convert(quote.min_amount),
    remaining_amount: convert(quote.remaining_amount),
    network_fee_amount: convert(quote.network_fee_amount),
  }
}

/** Format a quote's base-unit amount with digit grouping, the same way as balances. Empty when absent. */
export const prettyQuoteAmount = (value: string | null | undefined, precision: number): string =>
  value ? prettyAssetAmount(BigInt(value), precision) : ''

/**
 * Format a bridge minimum for display, rounding up to the displayed precision
 * so sending exactly the amount shown always satisfies it.
 */
export const prettyMinAmount = (minAmount: bigint, precision: number): string => {
  const step = BigInt(10) ** BigInt(Math.max(0, precision - BALANCE_DISPLAY_DECIMALS))
  return prettyAssetAmount(((minAmount + step - BigInt(1)) / step) * step, precision)
}

// Direction of a quote.
export type WrapType = 'wrap' | 'unwrap'

// Lifecycle: pending (awaiting deposit) -> deposited (deposit observed) ->
// processing (mint/payout in flight) -> completed; or expired/failed.
export type WrapStatus = 'pending' | 'deposited' | 'processing' | 'completed' | 'failed' | 'expired'

// Request body for POST /wrap and POST /unwrap.
export interface WrapQuoteRequest {
  chain: SourceChainId
  ticker: string
  sender: string
  receiver: string
}

// Snapshot of a wrap or unwrap quote (POST /wrap, POST /unwrap, GET /quote/{id}).
export interface WrapQuote {
  id: string
  type: WrapType
  chain: string
  ticker: string
  sender: string
  receiver: string
  /** Treasury address the sender must deposit to in order to fulfill this quote. */
  treasury: string
  status: WrapStatus
  /** Observed deposit amount in the asset's smallest base unit (decimal string). */
  amount: string | null
  /** Protocol fee deducted from the deposit, in base units (decimal string). */
  fee_amount: string | null
  /** Net payout (amount - fee) credited to the receiver, in base units. */
  payout_amount: string | null
  /** Minimum accepted deposit for this wrap or unwrap quote, in base units. */
  min_amount?: string | null
  /** Extra base-unit amount still needed to reach the minimum; zero once it does. */
  remaining_amount?: string | null
  /**
   * Fixed base-unit network charge deducted from the payout: unwrap delivery
   * on the destination chain, or sweeping a wrap deposit to treasury.
   */
  network_fee_amount?: string | null
  deposit_tx_hash: string | null
  mint_tx_hash: string | null
  burn_tx_hash: string | null
  payout_tx_hash: string | null
  /** Quote expiration as a unix timestamp in milliseconds. */
  expiry: number
}

// Standard error envelope returned for all non-2xx responses.
interface ArkadeWrapError {
  statusCode: number
  error: string
  message: string
}

const parseError = async (response: Response, fallback: string): Promise<never> => {
  let message = `${response.status} ${response.statusText}`
  try {
    const body = (await response.json()) as ArkadeWrapError
    if (body?.message) message = body.message
  } catch {
    // response body was not JSON; keep status-based message
  }
  throw new Error(`${fallback}: ${message}`)
}

/** Terminal states a quote can no longer progress from. */
export const isTerminalWrapStatus = (status: WrapStatus): boolean => {
  return status === 'completed' || status === 'failed' || status === 'expired'
}

/**
 * Create a wrap quote: reserves a treasury deposit address on the source chain.
 * Deposit the asset from `sender` to the returned `treasury` before `expiry` to
 * mint the equivalent Arkade-native asset to `receiver`.
 */
export const createWrapQuote = async (payload: WrapQuoteRequest): Promise<WrapQuote> => {
  const response = await fetch(`${getArkadeWrapBaseUrl()}/wrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) return parseError(response, 'Failed to create wrap quote')
  return normalizeQuoteLimits(await response.json())
}

// Unwrap names the wrapped Arkade asset (`USDT` -> `USDT-CX`), while wrap names
// the native one. The published spec says otherwise ("ticker on the destination
// chain"), but the live API rejects `ethereum/USDT` as an unsupported unwrap and
// accepts `ethereum/USDT-CX`. Callers pass the plain asset ticker for both.
export const toWrappedTicker = (ticker: string): string =>
  ticker.toUpperCase().endsWith(WRAPPED_TICKER_SUFFIX) ? ticker : `${ticker}${WRAPPED_TICKER_SUFFIX}`

/**
 * Create an unwrap quote: burn the wrapped Arkade asset and receive the
 * underlying native/token on the destination chain. Deposit the wrapped asset
 * from `sender` (Arkade address) to the returned `treasury` (Arkade address).
 */
export const createUnwrapQuote = async (payload: WrapQuoteRequest): Promise<WrapQuote> => {
  const response = await fetch(`${getArkadeWrapBaseUrl()}/unwrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, ticker: toWrappedTicker(payload.ticker) }),
  })
  if (!response.ok) return parseError(response, 'Failed to create unwrap quote')
  return normalizeQuoteLimits(await response.json())
}

/** Poll a wrap/unwrap quote by id. */
export const getWrapQuote = async (id: string): Promise<WrapQuote> => {
  if (!id) throw new Error('No quote ID provided')
  const response = await fetch(`${getArkadeWrapBaseUrl()}/quote/${id}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) return parseError(response, 'Failed to get quote status')
  return normalizeQuoteLimits(await response.json())
}
