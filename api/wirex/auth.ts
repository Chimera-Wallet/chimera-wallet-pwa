// Shared authentication logic for the Wirex integration's two HTTP endpoints
import { timingSafeEqual } from 'crypto'
import { getPartnerToken, getUserToken } from './token'

export const USER_WALLET_HEADER = 'x-wirex-user-wallet'

// Stripped from the outgoing request when proxying to Wirex: standard
// hop-by-hop headers, plus our own auth header, which is consumed here.
export const HOP_BY_HOP_REQUEST_HEADERS = new Set(['host', 'connection', 'content-length', USER_WALLET_HEADER])

/** Thrown for caller-facing auth failures, as opposed to upstream/Wirex errors. */
export class ProxyAuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/**
 * Resolve which bearer token a proxied Wirex call should run under.
 */
export async function resolveBearerToken(claimedWallet: string | null, chainId: string): Promise<string> {
  if (!claimedWallet) return getPartnerToken()
  return getUserToken({ type: 'wallet', value: claimedWallet }, chainId)
}

/** Build the headers to send upstream to Wirex: caller headers minus the hop-by-hop set, plus auth/chain headers. */
export function buildForwardedHeaders(
  requestHeaders: Iterable<[string, string]>,
  token: string,
  chainId: string,
): Record<string, string> {
  const forwarded: Record<string, string> = {}
  let hasAcceptHeader = false
  for (const [key, value] of requestHeaders) {
    const lowerKey = key.toLowerCase()
    if (HOP_BY_HOP_REQUEST_HEADERS.has(lowerKey)) continue
    forwarded[key] = value
    // Headers iteration always lowercases names, so this is the only
    // reliable way to tell whether the caller already sent an Accept header
    // — checking forwarded['Accept'] (capitalized) would never match.
    if (lowerKey === 'accept') hasAcceptHeader = true
  }
  forwarded['Authorization'] = `Bearer ${token}`
  forwarded['X-Chain-Id'] = chainId
  if (!hasAcceptHeader) forwarded['Accept'] = 'application/json'
  return forwarded
}

/**
 * Verify a Wirex webhook call by comparing a URL-path secret rather than a
 * signature.
 */
export function isValidWebhookSecret(providedSecret: string | undefined, expectedSecret: string): boolean {
  if (!providedSecret) return false

  const providedBuf = Buffer.from(providedSecret, 'utf8')
  const expectedBuf = Buffer.from(expectedSecret, 'utf8')

  // Different lengths would make timingSafeEqual throw rather than return false.
  if (providedBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(providedBuf, expectedBuf)
}
