// Shared authentication logic for the Wirex integration's two HTTP endpoints
import { timingSafeEqual } from 'crypto'
import { getPartnerToken, getUserToken } from './token'

export const USER_WALLET_HEADER = 'x-wirex-user-wallet'

export const FORWARDED_REQUEST_HEADERS = new Set([
  'content-type',
  'accept',
  // Partner-token user lookups identify the user with these (see token.ts).
  'x-user-wallet',
  'x-user-email',
])

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

/** Build the headers to send upstream to Wirex: allowlisted caller headers, plus auth/chain headers. */
export function buildForwardedHeaders(
  requestHeaders: Iterable<[string, string]>,
  token: string,
  chainId: string,
): Record<string, string> {
  const forwarded: Record<string, string> = {}
  for (const [key, value] of requestHeaders) {
    const lowerKey = key.toLowerCase()
    if (FORWARDED_REQUEST_HEADERS.has(lowerKey)) forwarded[lowerKey] = value
  }
  forwarded['authorization'] = `Bearer ${token}`
  forwarded['x-chain-id'] = chainId
  forwarded['accept'] ??= 'application/json'
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
