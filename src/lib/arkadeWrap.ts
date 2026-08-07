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

export const getArkadeWrapBaseUrl = (): string => {
  const url = import.meta.env.VITE_ARKADEWRAP_API
  if (!url) throw new Error('VITE_ARKADEWRAP_API is not set')
  return url
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
  return response.json()
}

/**
 * Create an unwrap quote: burn the wrapped Arkade asset and receive the
 * underlying native/token on the destination chain. Deposit the wrapped asset
 * from `sender` (Arkade address) to the returned `treasury` (Arkade address).
 */
export const createUnwrapQuote = async (payload: WrapQuoteRequest): Promise<WrapQuote> => {
  const response = await fetch(`${getArkadeWrapBaseUrl()}/unwrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) return parseError(response, 'Failed to create unwrap quote')
  return response.json()
}

/** Poll a wrap/unwrap quote by id. */
export const getWrapQuote = async (id: string): Promise<WrapQuote> => {
  if (!id) throw new Error('No quote ID provided')
  const response = await fetch(`${getArkadeWrapBaseUrl()}/quote/${id}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) return parseError(response, 'Failed to get quote status')
  return response.json()
}
