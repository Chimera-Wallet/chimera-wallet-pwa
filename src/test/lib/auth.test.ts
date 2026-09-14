// Unit tests for api/wirex/auth.ts — the shared auth logic behind
// proxy.ts (KYC-verified "act as user" token minting, header forwarding)
// and webhook.ts (URL-secret check). Kept free of @azure/functions so these
// run under the repo's existing (root) vitest setup with no test tooling
// added to this workspace.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  ProxyAuthError,
  USER_EMAIL_HEADER,
  KYC_TOKEN_HEADER,
  HOP_BY_HOP_REQUEST_HEADERS,
  verifyKycEmail,
  resolveBearerToken,
  buildForwardedHeaders,
  isValidWebhookSecret,
} from '../../../api/wirex/auth'

vi.mock('../../../api/wirex/token', () => ({
  getPartnerToken: vi.fn(async () => 'partner-token'),
  getUserToken: vi.fn(async (identifier: { type: string; value: string }) => `user-token-for-${identifier.value}`),
}))

const IDFLOW_API_URL = 'https://idflow.test'

describe('verifyKycEmail', () => {
  const fetchSpy = vi.fn()
  beforeEach(() => {
    fetchSpy.mockReset()
    vi.stubGlobal('fetch', fetchSpy)
  })

  it('throws when IDFLOW_API_URL is not configured', async () => {
    await expect(verifyKycEmail('token', undefined)).rejects.toThrow('Missing IDFLOW_API_URL configuration')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('calls GET /api/Entity/me with the bearer token and returns the email', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ email: 'alice@example.com' }), { status: 200 }))
    const email = await verifyKycEmail('kyc-token', IDFLOW_API_URL)
    expect(email).toBe('alice@example.com')
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe(`${IDFLOW_API_URL}/api/Entity/me`)
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer kyc-token')
  })

  it('throws a 401 ProxyAuthError when IDFlow rejects the token', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 401 }))
    await expect(verifyKycEmail('bad-token', IDFLOW_API_URL)).rejects.toMatchObject({
      status: 401,
      message: 'Invalid or expired KYC session',
    })
  })

  it('throws a 401 ProxyAuthError when IDFlow returns no email', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
    await expect(verifyKycEmail('token', IDFLOW_API_URL)).rejects.toMatchObject({
      status: 401,
      message: 'IDFlow session has no verified email',
    })
  })
})

describe('resolveBearerToken', () => {
  const fetchSpy = vi.fn()
  beforeEach(() => {
    fetchSpy.mockReset()
    vi.stubGlobal('fetch', fetchSpy)
  })

  it('returns the partner token when no email is claimed', async () => {
    const token = await resolveBearerToken(null, null, IDFLOW_API_URL)
    expect(token).toBe('partner-token')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects with 401 when an email is claimed but no KYC token is sent', async () => {
    await expect(resolveBearerToken('alice@example.com', null, IDFLOW_API_URL)).rejects.toMatchObject({
      status: 401,
      message: 'Missing KYC session for user-scoped request',
    })
  })

  it('rejects with 403 when the KYC token verifies to a different email than claimed', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ email: 'mallory@example.com' }), { status: 200 }))
    await expect(resolveBearerToken('alice@example.com', 'kyc-token', IDFLOW_API_URL)).rejects.toMatchObject({
      status: 403,
      message: 'Requested user does not match authenticated KYC session',
    })
  })

  it('mints a user-scoped token for the IDFlow-verified email when it matches the claim', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ email: 'Alice@Example.com' }), { status: 200 }))
    const token = await resolveBearerToken('alice@example.com', 'kyc-token', IDFLOW_API_URL)
    expect(token).toBe('user-token-for-Alice@Example.com')
  })
})

describe('buildForwardedHeaders', () => {
  it('drops hop-by-hop and internal auth headers, forwards the rest', () => {
    const requestHeaders = new Headers({
      [USER_EMAIL_HEADER]: 'alice@example.com',
      [KYC_TOKEN_HEADER]: 'kyc-token',
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
