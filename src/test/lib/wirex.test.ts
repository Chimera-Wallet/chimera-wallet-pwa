// Contract tests for src/lib/wirex.ts against Wirex's documented REST shapes
// (docs.wirexapp.com/reference/*). These assert the exact path, method,
// headers and JSON body each call sends, and how each response shape is
// read back — the class of bug found when this file was last reviewed
// (wrong path, wrong body field, wrong response envelope) is exactly what
// these catch, without needing a live Wirex sandbox.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  getWirexUserByEmail,
  createWirexUser,
  ensureWirexUser,
  getWirexWallet,
  getWirexCards,
  issueVirtualCard,
  getWirexCardLimits,
  setWirexCardLimits,
  estimateCardTransfer,
  transferToCard,
  type WirexUser,
  type WirexWallet,
  type WirexCard,
} from '../../lib/wirex'

// vitest-fetch-mock isn't used here: its internal Request normalization
// rejects jsdom's AbortSignal ("Expected signal to be an instance of
// AbortSignal") since wirex.ts's request() passes an AbortController signal
// for its request-timeout handling — a jsdom/node cross-realm class identity
// mismatch, unrelated to wirex.ts itself. Stubbing `fetch` directly sidesteps
// it: we only need the raw (url, init) args wirex.ts passes, never a real
// Request/Response round-trip.
const fetchSpy = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>()
vi.stubGlobal('fetch', fetchSpy)

const fetchMocker = {
  mockResponseOnce: (body: string, init?: { status?: number }) => {
    fetchSpy.mockImplementationOnce(async () => new Response(body, { status: init?.status ?? 200 }))
  },
  resetMocks: () => fetchSpy.mockReset(),
  get mock() {
    return fetchSpy.mock
  },
}

const PROXY_BASE = '/api/wirex'
const KYC_ACCESS_TOKEN = 'kyc-access-token-1'

const sampleUser: WirexUser = {
  user_id: 'user-1',
  user_address: '0xabc',
  chain_id: 8453,
  email: 'alice@example.com',
}

const sampleWallet: WirexWallet = {
  wallet_address: '0xabc',
  wallet_status: 'Confirmed',
}

const sampleCard: WirexCard = {
  id: 'card-1',
  status: 'Active',
  card_data: { payment_system: 'Visa', format: 'Virtual' },
  generation: 'Gen2',
  card_wallet_address: '0xabc',
  provider: 'Wirex',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  allowed_actions: [],
}

const lastCall = () => fetchMocker.mock.calls[0]
const lastCallInit = () => lastCall()[1]
const lastCallHeaders = () => new Headers(lastCallInit()?.headers)
const lastCallBody = () => JSON.parse(lastCallInit()?.body as string)

describe('wirex.ts REST client', () => {
  beforeEach(() => {
    fetchMocker.resetMocks()
  })

  describe('user lookup/creation — docs.wirexapp.com/docs/retail-authentication', () => {
    it('looks up a user via GET /api/v2/user with X-User-Email', async () => {
      fetchMocker.mockResponseOnce(JSON.stringify(sampleUser))
      const result = await getWirexUserByEmail('alice@example.com')
      expect(result).toEqual(sampleUser)
      const [url, init] = lastCall()
      expect(url).toBe(`${PROXY_BASE}/api/v2/user`)
      expect(init?.method).toBe('GET')
      expect(lastCallHeaders().get('X-User-Email')).toBe('alice@example.com')
    })

    it('returns null when no user exists yet (404)', async () => {
      fetchMocker.mockResponseOnce('', { status: 404 })
      const result = await getWirexUserByEmail('nobody@example.com')
      expect(result).toBeNull()
    })

    it('creates a user via POST /api/v2/user with X-User-Email and the payload as body', async () => {
      fetchMocker.mockResponseOnce(JSON.stringify(sampleUser))
      const result = await createWirexUser({ email: 'alice@example.com', firstName: 'Alice' })
      expect(result).toEqual(sampleUser)
      const [url, init] = lastCall()
      expect(url).toBe(`${PROXY_BASE}/api/v2/user`)
      expect(init?.method).toBe('POST')
      expect(lastCallHeaders().get('X-User-Email')).toBe('alice@example.com')
      expect(lastCallBody()).toEqual({ email: 'alice@example.com', firstName: 'Alice' })
    })

    it('ensureWirexUser returns the existing user without creating one', async () => {
      fetchMocker.mockResponseOnce(JSON.stringify(sampleUser))
      const result = await ensureWirexUser({ email: 'alice@example.com' })
      expect(result).toEqual(sampleUser)
      expect(fetchMocker.mock.calls.length).toBe(1)
    })

    it('ensureWirexUser creates a user when none exists yet', async () => {
      fetchMocker.mockResponseOnce('', { status: 404 })
      fetchMocker.mockResponseOnce(JSON.stringify(sampleUser))
      const result = await ensureWirexUser({ email: 'alice@example.com' })
      expect(result).toEqual(sampleUser)
      expect(fetchMocker.mock.calls.length).toBe(2)
      expect(fetchMocker.mock.calls[1][1]?.method).toBe('POST')
    })
  })

  describe('wallet — docs.wirexapp.com/reference/get_api-v1-wallet', () => {
    it('looks up the wallet via GET /api/v1/wallet with X-Wirex-User-Email and X-Kyc-Access-Token', async () => {
      fetchMocker.mockResponseOnce(JSON.stringify(sampleWallet))
      const result = await getWirexWallet('alice@example.com', KYC_ACCESS_TOKEN)
      expect(result).toEqual(sampleWallet)
      const [url, init] = lastCall()
      expect(url).toBe(`${PROXY_BASE}/api/v1/wallet`)
      expect(init?.method).toBe('GET')
      expect(lastCallHeaders().get('X-Wirex-User-Email')).toBe('alice@example.com')
      expect(lastCallHeaders().get('X-Kyc-Access-Token')).toBe(KYC_ACCESS_TOKEN)
    })
  })

  describe('cards list — docs.wirexapp.com/reference/get_api-v1-cards', () => {
    it('lists cards via GET /api/v1/cards and reads the `data` envelope', async () => {
      fetchMocker.mockResponseOnce(JSON.stringify({ data: [sampleCard] }))
      const result = await getWirexCards('alice@example.com', KYC_ACCESS_TOKEN)
      expect(result).toEqual({ data: [sampleCard] })
      const [url, init] = lastCall()
      expect(url).toBe(`${PROXY_BASE}/api/v1/cards`)
      expect(init?.method).toBe('GET')
      expect(lastCallHeaders().get('X-Wirex-User-Email')).toBe('alice@example.com')
      expect(lastCallHeaders().get('X-Kyc-Access-Token')).toBe(KYC_ACCESS_TOKEN)
    })

    it('encodes page_number/page_size/sort as query params', async () => {
      fetchMocker.mockResponseOnce(JSON.stringify({ data: [] }))
      await getWirexCards('alice@example.com', KYC_ACCESS_TOKEN, { pageNumber: 2, pageSize: 10, sort: 'usage' })
      const [url] = lastCall()
      expect(url).toBe(`${PROXY_BASE}/api/v1/cards?page_number=2&page_size=10&sort=usage`)
    })

    it('omits the query string entirely when no options are given', async () => {
      fetchMocker.mockResponseOnce(JSON.stringify({ data: [] }))
      await getWirexCards('alice@example.com', KYC_ACCESS_TOKEN, {})
      const [url] = lastCall()
      expect(url).toBe(`${PROXY_BASE}/api/v1/cards`)
    })
  })

  describe('virtual card issuance — docs.wirexapp.com/reference/post_api-v1-cards-virtual', () => {
    it('issues a virtual card via POST /api/v1/cards/virtual with only the fields given', async () => {
      fetchMocker.mockResponseOnce(JSON.stringify({ id: 'card-1' }))
      const result = await issueVirtualCard({ email: 'alice@example.com', kycAccessToken: KYC_ACCESS_TOKEN, cardName: 'My Card' })
      expect(result).toEqual({ id: 'card-1' })
      const [url, init] = lastCall()
      expect(url).toBe(`${PROXY_BASE}/api/v1/cards/virtual`)
      expect(init?.method).toBe('POST')
      expect(lastCallHeaders().get('X-Wirex-User-Email')).toBe('alice@example.com')
      expect(lastCallBody()).toEqual({ card_name: 'My Card' })
    })

    it('sends an empty body when no optional fields are given', async () => {
      fetchMocker.mockResponseOnce(JSON.stringify({ id: 'card-1' }))
      await issueVirtualCard({ email: 'alice@example.com', kycAccessToken: KYC_ACCESS_TOKEN })
      expect(lastCallBody()).toEqual({})
    })

    it('translates all optional fields to their documented snake_case names', async () => {
      fetchMocker.mockResponseOnce(JSON.stringify({ id: 'card-1' }))
      await issueVirtualCard({
        email: 'alice@example.com',
        kycAccessToken: KYC_ACCESS_TOKEN,
        cardName: 'My Card',
        nameOnCard: 'ALICE SMITH',
        paymentTransactionHash: '0xdeadbeef',
      })
      expect(lastCallBody()).toEqual({
        card_name: 'My Card',
        name_on_card: 'ALICE SMITH',
        payment_transaction_hash: '0xdeadbeef',
      })
    })
  })

  describe('card limits — docs.wirexapp.com/docs/retail-managing-card-limits', () => {
    it('reads limits via GET /api/v1/cards/{cardId} and returns the nested `limit` object', async () => {
      const cardResponse = { id: 'card-1', status: 'Active', limit: { daily_limit: 100, currency: 'EUR' } }
      fetchMocker.mockResponseOnce(JSON.stringify(cardResponse))
      const result = await getWirexCardLimits('0xWallet', 'card-1')
      expect(result).toEqual({ daily_limit: 100, currency: 'EUR' })
      const [url, init] = lastCall()
      expect(url).toBe(`${PROXY_BASE}/api/v1/cards/card-1`)
      expect(init?.method).toBe('GET')
      expect(lastCallHeaders().get('X-User-Wallet')).toBe('0xWallet')
    })

    it('returns null when the card lookup 404s', async () => {
      fetchMocker.mockResponseOnce('', { status: 404 })
      const result = await getWirexCardLimits('0xWallet', 'card-1')
      expect(result).toBeNull()
    })

    it('writes limits via PUT /api/v1/cards/{cardId}/limit (singular) with snake_case fields', async () => {
      fetchMocker.mockResponseOnce('')
      await setWirexCardLimits('0xWallet', 'card-1', { dailyLimit: 200, monthlyLimit: 2000, transactionLimit: 50 })
      const [url, init] = lastCall()
      expect(url).toBe(`${PROXY_BASE}/api/v1/cards/card-1/limit`)
      expect(init?.method).toBe('PUT')
      expect(lastCallHeaders().get('X-User-Wallet')).toBe('0xWallet')
      expect(lastCallBody()).toEqual({ daily_limit: 200, monthly_limit: 2000, transaction_limit: 50 })
    })

    it('omits unset fields from the PUT body (lifetime_limit is never sendable)', async () => {
      fetchMocker.mockResponseOnce('')
      await setWirexCardLimits('0xWallet', 'card-1', { dailyLimit: 0 })
      expect(lastCallBody()).toEqual({ daily_limit: 0 })
    })

    it('URL-encodes the cardId path segment', async () => {
      fetchMocker.mockResponseOnce(JSON.stringify({ id: 'x', status: 'Active', limit: {} }))
      await getWirexCardLimits('0xWallet', 'card/1 weird')
      const [url] = lastCall()
      expect(url).toBe(`${PROXY_BASE}/api/v1/cards/card%2F1%20weird`)
    })
  })

  describe('card transfer — docs.wirexapp.com/reference/post_api-v1-cards-transfer-estimate and post_api-v1-cards-transfer', () => {
    it('estimates a transfer via POST /api/v1/cards/transfer/estimate with the documented body fields', async () => {
      const estimateResponse = {
        amount: 100,
        currency: 'USD',
        estimation_id: 'est-1',
        expires_at: 1234567890,
        fee_amount: 1.5,
        estimated_amounts: [],
      }
      fetchMocker.mockResponseOnce(JSON.stringify(estimateResponse))
      const result = await estimateCardTransfer({
        email: 'alice@example.com',
        kycAccessToken: KYC_ACCESS_TOKEN,
        cardId: 'card-1',
        amount: '100',
        currency: 'USD',
        tokenAddresses: ['0xtoken1', '0xtoken2'],
      })
      expect(result).toEqual(estimateResponse)
      const [url, init] = lastCall()
      expect(url).toBe(`${PROXY_BASE}/api/v1/cards/transfer/estimate`)
      expect(init?.method).toBe('POST')
      expect(lastCallHeaders().get('X-Wirex-User-Email')).toBe('alice@example.com')
      expect(lastCallBody()).toEqual({
        amount: 100,
        currency: 'USD',
        external_card_id: 'card-1',
        tokens: ['0xtoken1', '0xtoken2'],
      })
    })

    it('omits currency from the estimate body when not given', async () => {
      fetchMocker.mockResponseOnce(
        JSON.stringify({ amount: 1, currency: 'USD', estimation_id: 'e', expires_at: 1, fee_amount: 0, estimated_amounts: [] }),
      )
      await estimateCardTransfer({
        email: 'alice@example.com',
        kycAccessToken: KYC_ACCESS_TOKEN,
        cardId: 'card-1',
        amount: '1',
        tokenAddresses: ['0xtoken1'],
      })
      expect(lastCallBody()).toEqual({ amount: 1, external_card_id: 'card-1', tokens: ['0xtoken1'] })
    })

    it('does NOT put cardId in the /api/v1/cards/transfer execute path (unlike the deprecated withdrawal flow)', async () => {
      fetchMocker.mockResponseOnce(JSON.stringify({ id: 'tx-1' }))
      const result = await transferToCard({
        email: 'alice@example.com',
        kycAccessToken: KYC_ACCESS_TOKEN,
        estimationId: 'est-1',
        tokenAddress: '0xtoken1',
      })
      expect(result).toEqual({ id: 'tx-1' })
      const [url, init] = lastCall()
      expect(url).toBe(`${PROXY_BASE}/api/v1/cards/transfer`)
      expect(init?.method).toBe('POST')
      expect(lastCallBody()).toEqual({ estimation_id: 'est-1', token_address: '0xtoken1' })
    })
  })

  describe('request() error/timeout handling shared by every call above', () => {
    it('throws the body.error message on a non-2xx response', async () => {
      fetchMocker.mockResponseOnce(JSON.stringify({ error: 'Invalid email' }), { status: 400 })
      await expect(getWirexUserByEmail('bad')).rejects.toThrow('Invalid email')
    })

    it('stringifies the response body when it has no `error` string', async () => {
      fetchMocker.mockResponseOnce(JSON.stringify({ foo: 'bar' }), { status: 500 })
      await expect(getWirexUserByEmail('alice@example.com')).rejects.toThrow('{"foo":"bar"}')
    })

    // NOTE: `Request failed: ${status}` is meant as the fallback when the response body carries
    // no usable error message, but JSON.stringify(body.error ?? body) is truthy for nearly any
    // body (even `{}` for unparseable JSON, as below) — so in practice this fallback is only
    // reachable when the body's `error` field is present but an empty string.
    it('only reaches the generic status fallback when `error` is an empty string', async () => {
      fetchMocker.mockResponseOnce('not json', { status: 500 })
      await expect(getWirexUserByEmail('alice@example.com')).rejects.toThrow('{}')

      fetchMocker.mockResponseOnce(JSON.stringify({ error: '' }), { status: 500 })
      await expect(getWirexUserByEmail('alice@example.com')).rejects.toThrow('Request failed: 500')
    })

    it('always sends Content-Type/Accept: application/json', async () => {
      fetchMocker.mockResponseOnce(JSON.stringify(sampleWallet))
      await getWirexWallet('alice@example.com', KYC_ACCESS_TOKEN)
      const headers = lastCallHeaders()
      expect(headers.get('Content-Type')).toBe('application/json')
      expect(headers.get('Accept')).toBe('application/json')
    })
  })
})
