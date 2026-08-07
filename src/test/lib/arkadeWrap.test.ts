import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import createFetchMock from 'vitest-fetch-mock'
import {
  createWrapQuote,
  createUnwrapQuote,
  getWrapQuote,
  isTerminalWrapStatus,
  type WrapQuote,
} from '../../lib/arkadeWrap'

const fetchMocker = createFetchMock(vi)
fetchMocker.enableMocks()

// These tests always run against the staging Arkade Wrap API URL.
const STAGING_URL = 'https://api.arkadewrap.com'

const sampleQuote: WrapQuote = {
  id: '3f4c0b5a-2e1d-4a7b-9f8c-1a2b3c4d5e6f',
  type: 'wrap',
  chain: 'ethereum',
  ticker: 'USDT',
  sender: '0x742d35cc6634c0532925a3b844bc9e7595f0beb1',
  receiver: 'ark1qexample',
  treasury: '0x00000000000000000000000000000000deadbeef',
  status: 'pending',
  amount: null,
  fee_amount: null,
  payout_amount: null,
  deposit_tx_hash: null,
  mint_tx_hash: null,
  burn_tx_hash: null,
  payout_tx_hash: null,
  expiry: 1747000000000,
}

describe('arkadeWrap API client', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_ARKADEWRAP_API', STAGING_URL)
    fetchMocker.resetMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('creates a wrap quote via POST /wrap', async () => {
    fetchMocker.mockResponseOnce(JSON.stringify(sampleQuote))
    const result = await createWrapQuote({
      chain: 'ethereum',
      ticker: 'USDT',
      sender: sampleQuote.sender,
      receiver: sampleQuote.receiver,
    })
    expect(result).toEqual(sampleQuote)
    const [url, init] = fetchMocker.mock.calls[0]
    expect(url).toBe(`${STAGING_URL}/wrap`)
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toMatchObject({ chain: 'ethereum', ticker: 'USDT' })
  })

  it('creates an unwrap quote via POST /unwrap', async () => {
    fetchMocker.mockResponseOnce(JSON.stringify({ ...sampleQuote, type: 'unwrap' }))
    const result = await createUnwrapQuote({
      chain: 'tron',
      ticker: 'USDT',
      sender: sampleQuote.receiver,
      receiver: 'TSomeTronAddress',
    })
    expect(result.type).toBe('unwrap')
    const [url] = fetchMocker.mock.calls[0]
    expect(url).toBe(`${STAGING_URL}/unwrap`)
  })

  it('polls a quote via GET /quote/{id}', async () => {
    fetchMocker.mockResponseOnce(JSON.stringify({ ...sampleQuote, status: 'completed' }))
    const result = await getWrapQuote(sampleQuote.id)
    expect(result.status).toBe('completed')
    const [url, init] = fetchMocker.mock.calls[0]
    expect(url).toBe(`${STAGING_URL}/quote/${sampleQuote.id}`)
    expect(init?.method).toBe('GET')
  })

  it('surfaces the API error message on non-2xx', async () => {
    fetchMocker.mockResponseOnce(
      JSON.stringify({ statusCode: 400, error: 'Bad Request', message: 'Unsupported wrap: ethereum/FOO' }),
      { status: 400 },
    )
    await expect(
      createWrapQuote({ chain: 'ethereum', ticker: 'FOO', sender: '0x0', receiver: 'ark1q' }),
    ).rejects.toThrow('Unsupported wrap: ethereum/FOO')
  })

  it('classifies terminal statuses', () => {
    expect(isTerminalWrapStatus('completed')).toBe(true)
    expect(isTerminalWrapStatus('failed')).toBe(true)
    expect(isTerminalWrapStatus('expired')).toBe(true)
    expect(isTerminalWrapStatus('pending')).toBe(false)
    expect(isTerminalWrapStatus('deposited')).toBe(false)
    expect(isTerminalWrapStatus('processing')).toBe(false)
  })
})
