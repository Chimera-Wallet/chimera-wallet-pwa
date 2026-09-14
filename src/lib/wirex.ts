/**
 * Wirex BaaS API client.
 *
 * All calls go through the same-origin `/api/wirex/*` proxy (api/wirex/proxy.ts)
 * — the browser never holds a Wirex client_secret or bearer token. User-lookup
 * and user-creation calls run under the partner token by forwarding Wirex's
 * own `X-User-Email` header verbatim; that's a different header from the
 * proxy's own `X-Wirex-User-Email` (used to mint a user-scoped token for
 * "act as this user" calls), so the two never collide.
 *
 * KYC: this app does not use Wirex's own hosted verification — users are
 * already verified through IDFlow (see ./kyc.ts). Wirex's "API-based" user
 * creation mode accepts already-verified identity data at creation time
 * instead of running its own KYC flow. createWirexUser below only sends what
 * IDFlow's profile exposes today (name, email) — this is a skeleton to build
 * on, not a finished KYC handoff. Before relying on this for real users,
 * confirm with Wirex the full field set their compliance team needs to
 * accept this as equivalent to their own KYC (date of birth, nationality,
 * address, document type/number are typical requirements this does not yet
 * send), and whether IDFlow needs to expose more of its profile to supply
 * them.
 */

const WIREX_PROXY_BASE = '/api/wirex'

/**
 * Headers for a call that runs "as" a Wirex user. api/wirex/proxy.ts won't
 * mint a user-scoped token from X-Wirex-User-Email alone — it also requires
 * this IDFlow access token (see ../providers/kyc.ts::getValidAccessToken) and
 * verifies it maps to the same email server-side, so an anonymous caller
 * can't claim an arbitrary user's email. This is temporary until proper 
 * session management can be discussed and put in place (as well as proper 
 * testing needing to be performed).
 */
const userAuthHeaders = (email: string, kycAccessToken: string): Record<string, string> => ({
  'X-Wirex-User-Email': email,
  'X-Kyc-Access-Token': kycAccessToken,
})

// Mirrors ramp.ts's AbortController-with-timeout pattern: these calls sit
// behind onboarding UI, so a bounded wait beats an indefinite spinner.
const REQUEST_TIMEOUT_MS = 30_000

async function request<T>(path: string, init?: RequestInit): Promise<T | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${WIREX_PROXY_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
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

  // A 404 here means "no Wirex user for this email yet" — not an error as it's 
  // the expected result if a user hasn't been created yet. 
  if (res.status === 404) return null

  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
    const message = typeof body.error === 'string' ? body.error : JSON.stringify(body.error ?? body)
    throw new Error(message || `Request failed: ${res.status}`)
  }

  return body as T
}

export interface WirexUser {
  user_id: string
  user_address: string
  chain_id: number
  status?: string
  email: string
  firstName?: string
  lastName?: string
}

/**
 * Look up an existing Wirex user by email — this doubles as the
 * "does this user already have an account" check (e.g. after an
 * uninstall/reinstall).
 */
export const getWirexUserByEmail = (email: string): Promise<WirexUser | null> =>
  request<WirexUser>('/api/v2/user', { method: 'GET', headers: { 'X-User-Email': email } })

export interface CreateWirexUserPayload {
  email: string
  firstName?: string
  lastName?: string
}

export const createWirexUser = (payload: CreateWirexUserPayload): Promise<WirexUser | null> =>
  request<WirexUser>('/api/v2/user', {
    method: 'POST',
    headers: { 'X-User-Email': payload.email },
    body: JSON.stringify(payload),
  })

/** Look up the Wirex user for this email, creating one if none exists yet. */
export const ensureWirexUser = async (payload: CreateWirexUserPayload): Promise<WirexUser | null> => {
  const existing = await getWirexUserByEmail(payload.email)
  if (existing) return existing
  return createWirexUser(payload)
}

// Wallet 
//
// Unlike user lookup/creation (which runs under the partner token, identified
// by Wirex's own X-User-Email header), wallet calls run "as" the Wirex user
// they belong to: setting the proxy's internal X-Wirex-User-Email header
// makes api/wirex/proxy.ts mint a user-scoped token (via token.ts's
// "Login as User" flow) before forwarding — that user token alone is enough
// to auth GET /api/v1/wallet per Wirex's reference
// (docs.wirexapp.com/reference/get_api-v1-wallet), so no extra X-User-Wallet
// header is needed here. `/api/v2/wallet` (the old path below) doesn't exist.
//
// There is no REST endpoint to register a wallet by POSTing its address —
// per docs.wirexapp.com/docs/retail-onchain-registration, registration
// happens by calling createUserAccountWithWallet() on-chain (via Wirex's SDK
// or a direct UserOperation,
// and Wirex notifies our backend afterward via a webhook
// (POST /v2/webhooks/wallets — see ./webhook.ts, currently log-only). So
// there's no registerWirexWallet call here: once the on-chain deploy
// confirms, the caller just re-fetches via getWirexWallet below once Wirex's
// indexer has picked up the on-chain event.

export interface WirexWallet {
  wallet_address: string
  wallet_name?: string
  wallet_type?: string
  wallet_status?: string
  chain_family?: string
  balances?: { token_symbol: string; token_address: string; balance: number }[]
  // Exact status/type enum values are unconfirmed against sandbox — extend
  // once verified.
}

/** Look up the Wirex wallet already registered for this user, if any. */
export const getWirexWallet = (email: string, kycAccessToken: string): Promise<WirexWallet | null> =>
  request<WirexWallet>('/api/v1/wallet', { method: 'GET', headers: userAuthHeaders(email, kycAccessToken) })

// Cards 
//
// Card calls run "as" the Wirex user (same X-Wirex-User-Email proxy header as
// wallet calls above) — a card belongs to a specific user, not the partner
// account broadly.
//
// PAN/expiry/CVV/PIN are deliberately NOT modeled here: Wirex's PCI-compliant
// SDK is meant to render those directly inside its own iframe so that data
// never touches our server or client code (keeping PCI scope off this app).


export interface WirexCard {
  id: string
  status: 'Requested' | 'NotActivated' | 'Active' | 'Closed' | 'Blocked'
  card_data: {
    card_name?: string
    payment_system: 'Visa' | 'MasterCard'
    format: 'Plastic' | 'Virtual' | 'Metal'
    name_on_card?: string
  }
  generation: 'Gen1' | 'Gen2'
  card_wallet_address: string
  provider: 'Wirex' | 'Bridge'
  created_at: string
  updated_at: string
  allowed_actions: { type: string; relative_path: string }[]
  // balances (Gen1 cards only), limit, and delivery_address vary by card and
  // are unconfirmed in exact shape — extend once verified against sandbox.
}

export interface GetWirexCardsOptions {
  pageNumber?: number
  pageSize?: number
  sort?: 'name' | 'usage'
}

export const getWirexCards = (
  email: string,
  kycAccessToken: string,
  options: GetWirexCardsOptions = {},
): Promise<{ data: WirexCard[] } | null> => {
  const params = new URLSearchParams()
  if (options.pageNumber !== undefined) params.set('page_number', String(options.pageNumber))
  if (options.pageSize !== undefined) params.set('page_size', String(options.pageSize))
  if (options.sort) params.set('sort', options.sort)
  const query = params.toString()

  return request<{ data: WirexCard[] }>(`/api/v1/cards${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: userAuthHeaders(email, kycAccessToken),
  })
}

export interface IssueVirtualCardPayload {
  email: string
  kycAccessToken: string
  cardName?: string
  nameOnCard?: string
  /** Required only when order/delivery fees apply. */
  paymentTransactionHash?: string
}

/** Issue a virtual card. Confirmed against docs.wirexapp.com/reference/post_api-v1-cards-virtual. */
export const issueVirtualCard = (payload: IssueVirtualCardPayload): Promise<{ id: string } | null> =>
  request<{ id: string }>('/api/v1/cards/virtual', {
    method: 'POST',
    headers: userAuthHeaders(payload.email, payload.kycAccessToken),
    body: JSON.stringify({
      ...(payload.cardName ? { card_name: payload.cardName } : {}),
      ...(payload.nameOnCard ? { name_on_card: payload.nameOnCard } : {}),
      ...(payload.paymentTransactionHash ? { payment_transaction_hash: payload.paymentTransactionHash } : {}),
    }),
  })

// TODO: metal card issuance (POST /api/v1/cards/metal) needs a required
// delivery_address and, per Wirex's reference, must be used together with a
// separate "Create invoice" API — the card is only issued after that
// invoice's payment settles. Not implemented until that invoice flow exists
// on our side. No physical/plastic-card issuance endpoint was found in
// Wirex's reference, so that format may not be self-serve via this API.

// Confirmed against docs.wirexapp.com/docs/retail-managing-card-limits. Unlike
// wallet/card-list/issue/transfer above, these two run under the partner
// token with X-User-Wallet identifying the card's owner (same pattern as
// X-User-Email on the user lookup/creation calls further up — forwarded
// verbatim, not exchanged for a user-scoped token), so no X-Wirex-User-Email/
// X-Kyc-Access-Token is needed here.
//
// -1 disables a given limit; 0 blocks all spending on it; a positive number
// is a hard cap. lifetime_limit/lifetime_usage are read-only — Wirex returns
// them but PUT .../limit does not accept lifetime_limit.
export interface WirexCardLimits {
  daily_limit?: number
  daily_usage?: number
  monthly_limit?: number
  monthly_usage?: number
  lifetime_limit?: number
  lifetime_usage?: number
  currency?: string
}

interface WirexCardWithLimits {
  id: string
  status: WirexCard['status']
  limit: WirexCardLimits
}

/** Limits are part of the card resource itself — GET /api/v1/cards/{cardId}, not a dedicated .../limits endpoint. */
export const getWirexCardLimits = async (walletAddress: string, cardId: string): Promise<WirexCardLimits | null> => {
  const card = await request<WirexCardWithLimits>(`/api/v1/cards/${encodeURIComponent(cardId)}`, {
    method: 'GET',
    headers: { 'X-User-Wallet': walletAddress },
  })
  return card?.limit ?? null
}

export interface SetWirexCardLimitsPayload {
  dailyLimit?: number
  monthlyLimit?: number
  transactionLimit?: number
}

/** PUT /api/v1/cards/{cardId}/limit. */
export const setWirexCardLimits = async (
  walletAddress: string,
  cardId: string,
  limits: SetWirexCardLimitsPayload,
): Promise<void> => {
  await request<unknown>(`/api/v1/cards/${encodeURIComponent(cardId)}/limit`, {
    method: 'PUT',
    headers: { 'X-User-Wallet': walletAddress },
    body: JSON.stringify({
      ...(limits.dailyLimit !== undefined ? { daily_limit: limits.dailyLimit } : {}),
      ...(limits.monthlyLimit !== undefined ? { monthly_limit: limits.monthlyLimit } : {}),
      ...(limits.transactionLimit !== undefined ? { transaction_limit: limits.transactionLimit } : {}),
    }),
  })
}

// Push-to-card
//
// Wirex's push-to-external-card withdrawal (POST /api/v1/cards/{cardId}/
// withdraw/estimate and .../withdraw/execute) is deprecated with no stated
// replacement per Wirex's reference docs — it's been removed here rather than
// kept as dead code against a sunset API. If a "cash out to another card"
// flow is needed later, check Wirex's reference for a current equivalent.
//
// Transfer below is a different, still-current operation: moving a specific
// on-chain token (token_address) to the card's own balance, confirmed against
// docs.wirexapp.com/reference/post_api-v1-cards-transfer-estimate and
// .../post_api-v1-cards-transfer. It's a two-step estimate-then-execute flow
// like withdrawal was, but execute takes no cardId: the card is fixed as
// external_card_id during the estimate step, and execute only needs the
// resulting estimation_id plus the token being moved.

export interface EstimateCardTransferPayload {
  email: string
  kycAccessToken: string
  cardId: string
  amount: string
  currency?: string
  /** On-chain token addresses to transfer from. */
  tokenAddresses: string[]
}

export interface CardTransferEstimate {
  amount: number
  currency: string
  estimation_id: string
  expires_at: number
  fee_amount: number
  // Per-token breakdown (amount, fees, exchange rate, token details) —
  // exact shape unconfirmed against live sandbox.
  estimated_amounts: unknown[]
}

export const estimateCardTransfer = (payload: EstimateCardTransferPayload): Promise<CardTransferEstimate | null> =>
  request<CardTransferEstimate>('/api/v1/cards/transfer/estimate', {
    method: 'POST',
    headers: userAuthHeaders(payload.email, payload.kycAccessToken),
    body: JSON.stringify({
      amount: Number(payload.amount),
      ...(payload.currency ? { currency: payload.currency } : {}),
      external_card_id: payload.cardId,
      tokens: payload.tokenAddresses,
    }),
  })

export interface TransferToCardPayload {
  email: string
  kycAccessToken: string
  /** From a prior estimateCardTransfer() call. */
  estimationId: string
  /** Which of the estimate's tokens to actually move to the card's balance. */
  tokenAddress: string
}

export const transferToCard = (payload: TransferToCardPayload): Promise<{ id: string } | null> =>
  request<{ id: string }>('/api/v1/cards/transfer', {
    method: 'POST',
    headers: userAuthHeaders(payload.email, payload.kycAccessToken),
    body: JSON.stringify({ estimation_id: payload.estimationId, token_address: payload.tokenAddress }),
  })
