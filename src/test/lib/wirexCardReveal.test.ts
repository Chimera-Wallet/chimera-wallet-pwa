import { describe, expect, it, vi } from 'vitest'
import { RevealSessionError, createRevealSession } from '../../../api/wirex/cardRevealSession'

const NOW = 1_800_000_000_000 // epoch ms
const nowS = NOW / 1000
const address = '0x' + 'a'.repeat(40)
const signature = '0x' + 'b'.repeat(130)

const setup = (verify: Response | (() => Promise<Response>) = jsonResponse({ action_token: 'action-1' })) => {
  const getToken = vi.fn().mockResolvedValue('user-token')
  const fetchFn = vi.fn(typeof verify === 'function' ? verify : async () => verify)
  const deps = { apiBase: 'https://wirex.test', chainId: '8453', now: NOW, getToken, fetchFn: fetchFn as typeof fetch }
  return { getToken, fetchFn, deps }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const expectError = async (promise: Promise<unknown>, status: number) => {
  const err = await promise.catch((e) => e)
  expect(err).toBeInstanceOf(RevealSessionError)
  expect((err as RevealSessionError).status).toBe(status)
}

describe('createRevealSession (api/wirex/cardRevealSession.ts)', () => {
  it('returns the user token and action token once Wirex accepts the signature', async () => {
    const { deps, getToken, fetchFn } = setup()
    const session = await createRevealSession({ userAddress: address, nonce: nowS, signature }, deps)

    expect(session).toEqual({ accessToken: 'user-token', actionToken: 'action-1' })
    expect(getToken).toHaveBeenCalledWith({ type: 'wallet', value: address }, '8453')
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://wirex.test/api/v1/confirmation/signature/verify')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer user-token')
    expect(new Headers(init.headers).get('X-Chain-Id')).toBe('8453')
    expect(JSON.parse(init.body as string)).toEqual({
      action_type: 'GetCardDetails',
      message_signature: signature,
      nonce: nowS,
    })
  })

  it('does not release the user token when Wirex rejects the signature', async () => {
    const { deps } = setup(jsonResponse({ error: 'Invalid signature' }, 400))
    const err = await createRevealSession({ userAddress: address, nonce: nowS, signature }, deps).catch((e) => e)
    expect(err).toBeInstanceOf(RevealSessionError)
    expect(err.status).toBe(401)
    expect(JSON.stringify(err)).not.toContain('user-token')
    expect(err.message).not.toContain('user-token')
  })

  it('maps a Wirex outage to 502', async () => {
    const { deps } = setup(jsonResponse({}, 503))
    await expectError(createRevealSession({ userAddress: address, nonce: nowS, signature }, deps), 502)
  })

  it('rejects a response without an action token', async () => {
    const { deps } = setup(jsonResponse({}))
    await expectError(createRevealSession({ userAddress: address, nonce: nowS, signature }, deps), 502)
  })

  it.each([
    ['stale nonce', { userAddress: address, nonce: nowS - 61, signature }],
    ['future nonce', { userAddress: address, nonce: nowS + 61, signature }],
    ['non-integer nonce', { userAddress: address, nonce: nowS + 0.5, signature }],
    ['bad address', { userAddress: '0x123', nonce: nowS, signature }],
    ['bad signature', { userAddress: address, nonce: nowS, signature: '0xdead' }],
    ['missing body', undefined],
  ])('rejects %s with 400 before calling Wirex', async (_, body) => {
    const { deps, getToken, fetchFn } = setup()
    await expectError(createRevealSession(body, deps), 400)
    expect(getToken).not.toHaveBeenCalled()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('maps a user-token failure to 502 without calling verify', async () => {
    const { deps, getToken, fetchFn } = setup()
    getToken.mockRejectedValue(new Error('boom'))
    await expectError(createRevealSession({ userAddress: address, nonce: nowS, signature }, deps), 502)
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
