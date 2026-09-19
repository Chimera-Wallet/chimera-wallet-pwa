/**
 * Wirex BaaS API client.
 *
 * All calls go through the same-origin `/api/wirex/*` proxy (api/wirex/proxy.ts)
 * so the browser never holds a Wirex client_secret or bearer token.
 *
 * User lookup/creation (GET/POST /api/v2/user) run under the partner token,
 * identified by `X-User-Wallet`.
 *
 * KYC is yet to be fully implemented as details still need to be worked out 
 * so user creation and all subsequent operations aren't FULLY implemented.
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

interface RequestOptions {
  /**
   * Treat a "not found" response as a null result rather than an error.
   * Only correct for a lookup GET.
   */
  notFoundIsNull?: boolean
}

async function request<T>(path: string, init?: RequestInit, opts: RequestOptions = {}): Promise<T | null> {
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

  // A 404 here means is the expected result
  // when e.g. a user hasn't been created yet.
  if (res.status === 404) return null

  const body = await res.json().catch(() => ({}))

  if (opts.notFoundIsNull && body?.error_reason === 'ErrorNotFound') return null

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

// GET/POST /api/v2/user's actual response shape (confirmed live) — email and
// name live under `profile`, not top-level, unlike the flat WirexUser this
// app works with elsewhere. Only the fields toWirexUser reads are modeled;
// the response also carries `id`, `owner`, `residence_address`,
// `verification` and `capabilities`, unused here.
interface WirexUserApiResponse {
  user_id: string
  user_address: string
  chain_id: number
  profile: {
    email: string
    first_name?: string
    last_name?: string
    status?: string
  }
}

const toWirexUser = (raw: WirexUserApiResponse): WirexUser => ({
  user_id: raw.user_id,
  user_address: raw.user_address,
  chain_id: raw.chain_id,
  status: raw.profile.status,
  email: raw.profile.email,
  firstName: raw.profile.first_name,
  lastName: raw.profile.last_name,
})

/**
 * Look up an existing Wirex user by their EVM signer address — this doubles
 * as the "does this user already have an account" check (e.g. after an
 * uninstall/reinstall, since the address re-derives deterministically from
 * the same mnemonic+password).
 */
export const getWirexUserByAddress = async (userAddress: string): Promise<WirexUser | null> => {
  const raw = await request<WirexUserApiResponse>(
    '/api/v2/user',
    { method: 'GET', headers: { 'X-User-Wallet': userAddress } },
    { notFoundIsNull: true },
  )
  return raw && toWirexUser(raw)
}

export interface WirexResidenceAddress {
  line1: string
  city: string
  postCode: string
  country: string
  line2?: string
  state?: string
}

export interface CreateWirexUserPayload {
  /** This wallet's EVM signer address.*/
  userAddress: string
  email: string
  firstName: string
  lastName: string
  /** YYYY-MM-DD. */
  dateOfBirth: string
  phoneNumber: string
  /** ISO 3166-1 alpha-2. */
  nationality: string
  residenceAddress: WirexResidenceAddress
  isPep: boolean
}

export const createWirexUser = async (payload: CreateWirexUserPayload): Promise<WirexUser | null> => {
  const raw = await request<WirexUserApiResponse>('/api/v2/user', {
    method: 'POST',
    body: JSON.stringify({
      user_address: payload.userAddress,
      initial_data: {
        is_pep: payload.isPep,
        profile: {
          first_name: payload.firstName,
          last_name: payload.lastName,
          email: payload.email,
          date_of_birth: payload.dateOfBirth,
          phone_number: payload.phoneNumber,
          nationality: payload.nationality,
        },
        residence_address: {
          line1: payload.residenceAddress.line1,
          city: payload.residenceAddress.city,
          post_code: payload.residenceAddress.postCode,
          country: payload.residenceAddress.country,
          ...(payload.residenceAddress.line2 ? { line2: payload.residenceAddress.line2 } : {}),
          ...(payload.residenceAddress.state ? { state: payload.residenceAddress.state } : {}),
        },
      },
    }),
  })
  return raw && toWirexUser(raw)
}

/** Look up the Wirex user for this EVM address, creating one if none exists yet. */
export const ensureWirexUser = async (payload: CreateWirexUserPayload): Promise<WirexUser | null> => {
  const existing = await getWirexUserByAddress(payload.userAddress)
  if (existing) return existing
  return createWirexUser(payload)
}

// Wallet 
//
// Unlike user lookup/creation (which runs under the partner token, identified
// by Wirex's own X-User-Email header), wallet calls run "as" the Wirex user
// they belong to: setting the proxy's internal X-Wirex-User-Email header
// makes api/wirex/proxy.ts mint a user-scoped token (via token.ts's
// "Login as User" flow) before forwarding..

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
// Card calls run "as" the Wirex user so a card belongs to a specific user, 
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
  const card = await request<WirexCardWithLimits>(
    `/api/v1/cards/${encodeURIComponent(cardId)}`,
    { method: 'GET', headers: { 'X-User-Wallet': walletAddress } },
    { notFoundIsNull: true },
  )
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
