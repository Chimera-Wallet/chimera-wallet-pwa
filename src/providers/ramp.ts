/**
 * ramp-system API client — the fiat<->crypto on/off-ramp and gift-card backend.
 *
 * This is a distinct backend from the legacy Chimera API (`./chimera.tsx`):
 * ramp-system speaks its own "native" field shape (no `from_asset`/`to_asset`,
 * no `-ARK` ticker suffix, no `/otc/deposit/` style paths, no separate quote
 * step) — see ramp-system's CLAUDE.md "API field names" / "No legacy client
 * compatibility". Crypto-to-crypto swaps (SwapForm/OrderDetails) still use
 * `./chimera.tsx` — ramp-system has no equivalent for that.
 *
 * No hardcoded/fallback base URL: VITE_RAMP_API must be set per environment
 * (see .env.example). Mirrors lib/arkadeWrap.ts::getArkadeWrapBaseUrl() — the
 * project's established pattern for a required API base URL. If it's missing,
 * fail loudly rather than silently guessing an environment.
 */

const getRampApiBaseUrl = (): string => {
  const url = import.meta.env.VITE_RAMP_API
  if (!url) throw new Error('VITE_RAMP_API is not set')
  return url
}

// A request that never settles is worse here than one that fails: these calls
// sit behind buttons on the bank transfer screens, and on a flaky mobile
// connection an un-timed fetch leaves the user staring at a spinner with no way
// forward. Bounded wait, surfaced as a normal error the screens already render.
// AbortController rather than AbortSignal.timeout() for older mobile Safari.
const REQUEST_TIMEOUT_MS = 30_000

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${getRampApiBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
        ...init?.headers,
      },
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('The request timed out. Please check your connection and try again.')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
    // ramp-system's error responses are always { error: string | object }
    const message = typeof body.error === 'string' ? body.error : JSON.stringify(body.error ?? body)
    throw new Error(message || `Request failed: ${res.status}`)
  }

  return body as T
}

// ─── Shared types ───────────────────────────────────────────────────────────

export type RampOrderDirection = 'onramp' | 'offramp'

export type RampOrderStatus =
  | 'WAITING_FOR_DEPOSIT'
  | 'DEPOSIT_RECEIVED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'PENDING_MANUAL'
  | 'REJECTED'
  | 'EXPIRED'
  | 'REFUNDED'

export type RampDestinationType = 'crypto' | 'sepa' | 'swift' | 'us' | 'gift_card'

// Native order shape — see ramp-system's services/order.ts::serializeOrder.
export interface RampOrder {
  id: string // short public token
  code: string
  email: string
  direction: RampOrderDirection
  asset: string | null
  fiat_currency: string
  fiat_amount: string | null
  crypto_amount: string | null
  status: RampOrderStatus
  transfer_code: string
  destination_type: RampDestinationType | null
  destination_crypto_address: string | null
  deposit_iban: string | null
  deposit_bic: string | null
  deposit_beneficiary: string | null
  deposit_bank_name: string | null
  deposit_payment_type: string | null
  kyc_verified: boolean
  created_at: string
  expires_at: string | null
  completed_at: string | null
}

export interface RampBankDetails {
  iban: string
  bic: string
  beneficiary: string
  bank_name: string
  payment_type: string
  transfer_code: string
}

export interface RampFee {
  feePct: string
  feeFlat: string
  feeAmount: string
  netAmount: string
}

export type RampOrigin = 'api' | 'web' | 'app'

// This wallet's crypto legs are always Arkade addresses (ark1/tark1 — see
// lib/asp.ts::getReceivingAddresses), never a native on-chain address.
// ramp-system splits each asset into two distinct tickers by payout network
// (see ramp-system/apps/api/src/config/assets.ts): "BTC"/"USDT" settle to a
// native on-chain address, "ARK-BTC"/"USDT-CX" to an Arkade address. Every
// asset ticker this client sends to or reads from ramp-system must be the
// Arkade one — translate at this boundary so the rest of the app keeps using
// its own plain symbols (BTC, USDT), matching lib/assets.ts.
const ARKADE_TICKER: Record<string, string> = { BTC: 'ARK-BTC', USDT: 'USDT-CX' }
const PLAIN_TICKER: Record<string, string> = Object.fromEntries(
  Object.entries(ARKADE_TICKER).map(([plain, arkade]) => [arkade, plain]),
)

const toArkadeTicker = (asset: string): string => ARKADE_TICKER[asset.toUpperCase()] ?? asset
const fromArkadeTicker = (ticker: string): string => PLAIN_TICKER[ticker] ?? ticker

const normalizeOrderAsset = <T extends { asset: string | null }>(order: T): T =>
  order.asset ? { ...order, asset: fromArkadeTicker(order.asset) } : order

// ─── Assets ─────────────────────────────────────────────────────────────────

export interface RampAsset {
  symbol: string
  name: string
  precision?: number
}

export interface RampAssetsResponse {
  from_assets: RampAsset[]
  to_assets: RampAsset[]
  supported_pairs: Record<string, string[]>
}

export const getRampAssets = (): Promise<RampAssetsResponse> => request('/assets')

// ─── On-ramp (fiat -> crypto) ───────────────────────────────────────────────

export interface CreateOnRampOrderPayload {
  asset: string // crypto ticker, e.g. BTC
  fiat_currency: string
  email: string
  fiat_amount: string
  destination_crypto_address: string
  refund_address?: string
  origin?: RampOrigin
}

export interface CreateOnRampOrderResponse {
  order: RampOrder
  bank_details: RampBankDetails
  fee: RampFee
}

export const createOnRampOrder = async (payload: CreateOnRampOrderPayload): Promise<CreateOnRampOrderResponse> => {
  const result = await request<CreateOnRampOrderResponse>('/onramp', {
    method: 'POST',
    body: JSON.stringify({ ...payload, asset: toArkadeTicker(payload.asset) }),
  })
  return { ...result, order: normalizeOrderAsset(result.order) }
}

// ─── Off-ramp (crypto -> fiat) ──────────────────────────────────────────────

interface OffRampBase {
  asset: string
  fiat_currency: string
  email: string
  crypto_amount: string
  origin?: RampOrigin
}

export type CreateOffRampOrderPayload = OffRampBase &
  (
    | {
        destination_type: 'sepa'
        // Both optional: a KYC-verified customer's IBAN is filled in
        // server-side from ID-Flow regardless of what's submitted here.
        destination_bank_address?: string // IBAN
        destination_bank_name?: string // beneficiary name
      }
    | {
        destination_type: 'swift'
        destination_bank_address: string // IBAN
        destination_bic: string
        destination_bank_name: string // beneficiary name
        destination_country: string // ISO 3166-1 alpha-2
        destination_street_name: string
        destination_building_number: string
        destination_town_name: string
        destination_post_code: string
      }
    | {
        destination_type: 'us'
        destination_bank_account_number: string
        destination_bank_routing_number: string
        destination_bank_name: string // beneficiary name
      }
  )

export interface CreateOffRampOrderResponse {
  order: RampOrder
  deposit_crypto_address: string | null
  fee: RampFee
}

export const createOffRampOrder = async (payload: CreateOffRampOrderPayload): Promise<CreateOffRampOrderResponse> => {
  const result = await request<CreateOffRampOrderResponse>('/offramp', {
    method: 'POST',
    body: JSON.stringify({ ...payload, asset: toArkadeTicker(payload.asset) }),
  })
  return { ...result, order: normalizeOrderAsset(result.order) }
}

// ─── Order status ───────────────────────────────────────────────────────────

export const getRampOrderStatus = (token: string): Promise<RampOrder> =>
  request<{ order: RampOrder }>(`/order/${encodeURIComponent(token)}`).then((r) => normalizeOrderAsset(r.order))

// ─── Gift cards ─────────────────────────────────────────────────────────────

export interface PurchaseGiftCardPayload {
  fiat_currency: string
  fiat_amount: string
  email: string
  recipient_email?: string
  origin?: RampOrigin
}

export interface PurchaseGiftCardResponse {
  order: RampOrder
  bank_details: RampBankDetails
  fee: RampFee
}

export const purchaseGiftCard = (payload: PurchaseGiftCardPayload): Promise<PurchaseGiftCardResponse> =>
  request('/gift-card/purchase', { method: 'POST', body: JSON.stringify(payload) })

export interface RampGiftCard {
  identification_code: string
  fiat_currency: string
  amount: string
  active: boolean
  redeemed: boolean
}

export const getGiftCard = (code: string): Promise<RampGiftCard> =>
  request(`/gift-card/${encodeURIComponent(code)}`)

interface RedeemGiftCardBase {
  code: string
  email: string
  asset: string
}

export type RedeemGiftCardPayload = RedeemGiftCardBase &
  (
    | { destination_type: 'crypto'; destination_crypto_address: string }
    | {
        destination_type: 'sepa'
        destination_bank_address: string
        destination_bank_name: string
      }
    | {
        destination_type: 'swift'
        destination_bank_address: string
        destination_bic: string
        destination_bank_name: string
        destination_country: string
        destination_street_name: string
        destination_building_number: string
        destination_town_name: string
        destination_post_code: string
      }
    | {
        destination_type: 'us'
        destination_bank_account_number: string
        destination_bank_routing_number: string
        destination_bank_name: string
      }
  )

export interface RedeemGiftCardResponse {
  order: {
    id: string
    token: string
    code: string
    status: RampOrderStatus
    fiat_currency: string
    fiat_amount: string | null
    asset: string
    crypto_amount: string | null
  }
}

export const redeemGiftCard = async (payload: RedeemGiftCardPayload): Promise<RedeemGiftCardResponse> => {
  const result = await request<RedeemGiftCardResponse>('/gift-card/redeem', {
    method: 'POST',
    body: JSON.stringify({ ...payload, asset: toArkadeTicker(payload.asset) }),
  })
  return { order: normalizeOrderAsset(result.order) }
}
