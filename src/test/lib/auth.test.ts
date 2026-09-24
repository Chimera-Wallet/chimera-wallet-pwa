import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  ProxyAuthError,
  USER_WALLET_HEADER,
  HOP_BY_HOP_REQUEST_HEADERS,
  resolveBearerToken,
  buildForwardedHeaders,
  isValidWebhookSecret,
} from '../../../api/wirex/auth'

vi.mock('../../../api/wirex/token', () => ({
  getPartnerToken: vi.fn(async () => 'partner-token'),
  getUserToken: vi.fn(async (identifier: { type: string; value: string }) => `user-token-for-${identifier.value}`),
}))

describe('resolveBearerToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the partner token when no wallet is claimed', async () => {
    const token = await resolveBearerToken(null, '8453')
    expect(token).toBe('partner-token')
  })

  it('mints a user-scoped token for the claimed wallet address, trusted as-is', async () => {
    const token = await resolveBearerToken('0xabc', '8453')
    expect(token).toBe('user-token-for-0xabc')
  })
})

describe('buildForwardedHeaders', () => {
  it('drops hop-by-hop and internal auth headers, forwards the rest', () => {
    const requestHeaders = new Headers({
      [USER_WALLET_HEADER]: '0xabc',
      Host: 'app.example.com',
      Connection: 'keep-alive',
      'Content-Length': '123',
      'X-Custom': 'keep-me',
    })

    const forwarded = buildForwardedHeaders(requestHeaders, 'upstream-token', '8453')

    for (const header of HOP_BY_HOP_REQUEST_HEADERS) {
      expect(Object.keys(forwarded).map((k) => k.toLowerCase())).not.toContain(header)
    }
    // Headers iteration normalizes names to lowercase per the Fetch spec —
    // this is fine over HTTP (header names are case-insensitive), but means
    // the forwarded object's keys come back lowercased too.
    expect(forwarded['x-custom']).toBe('keep-me')
    expect(forwarded['Authorization']).toBe('Bearer upstream-token')
    expect(forwarded['X-Chain-Id']).toBe('8453')
  })

  it('defaults Accept to application/json when the caller did not send one', () => {
    const forwarded = buildForwardedHeaders(new Headers(), 'token', '1')
    expect(forwarded['Accept']).toBe('application/json')
  })

  it('preserves a caller-supplied Accept header instead of overwriting it', () => {
    const forwarded = buildForwardedHeaders(new Headers({ Accept: 'text/plain' }), 'token', '1')
    expect(forwarded['accept']).toBe('text/plain')
    expect(forwarded['Accept']).toBeUndefined()
  })
})

describe('isValidWebhookSecret', () => {
  const secret = 'webhook-url-secret'

  it('returns false when no secret was provided (e.g. path segment missing)', () => {
    expect(isValidWebhookSecret(undefined, secret)).toBe(false)
  })

  it('returns true when the provided secret matches exactly', () => {
    expect(isValidWebhookSecret(secret, secret)).toBe(true)
  })

  it('returns false for a wrong secret of the same length', () => {
    const wrongSecret = secret.slice(0, -1) + (secret.endsWith('t') ? 'x' : 't')
    expect(isValidWebhookSecret(wrongSecret, secret)).toBe(false)
  })

  it('returns false (not throw) for a secret of a different length', () => {
    expect(isValidWebhookSecret('short', secret)).toBe(false)
  })

  it('returns false for an empty provided secret', () => {
    expect(isValidWebhookSecret('', secret)).toBe(false)
  })
})

describe('ProxyAuthError', () => {
  it('carries the given status and message', () => {
    const err = new ProxyAuthError(403, 'nope')
    expect(err).toBeInstanceOf(Error)
    expect(err.status).toBe(403)
    expect(err.message).toBe('nope')
  })
})
