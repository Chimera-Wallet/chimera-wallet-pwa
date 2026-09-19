// Shared authentication logic for the Wirex integration's two HTTP endpoints
// (proxy.ts, webhook.ts): verifying an inbound Wirex webhook, and verifying a
// proxied request's claimed user identity against IDFlow before minting a
// Wirex "Login as User" token for it (see proxy.ts's header comment for why
// that verification exists).
import { timingSafeEqual } from 'crypto'
import { getPartnerToken, getUserToken } from './token'

export const USER_EMAIL_HEADER = 'x-wirex-user-email'
export const KYC_TOKEN_HEADER = 'x-kyc-access-token'

// Stripped from the outgoing request when proxying to Wirex: standard
// hop-by-hop headers, plus our own two auth headers, which are consumed here.
export const HOP_BY_HOP_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  USER_EMAIL_HEADER,
  KYC_TOKEN_HEADER,
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

/** Resolve the IDFlow-verified email for a caller-supplied IDFlow access token. */
export async function verifyKycEmail(accessToken: string, idflowApiUrl: string | undefined): Promise<string> {
  if (!idflowApiUrl) throw new Error('Missing IDFLOW_API_URL configuration')

  const res = await fetch(`${idflowApiUrl}/api/Entity/me`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new ProxyAuthError(401, 'Invalid or expired KYC session')

  const profile = (await res.json()) as { email?: string }
  if (!profile.email) throw new ProxyAuthError(401, 'IDFlow session has no verified email')
  return profile.email
}

/**
 * Resolve which bearer token a proxied Wirex call should run under.
 * `claimedEmail`/`kycAccessToken` come from the proxy's USER_EMAIL_HEADER /
 * KYC_TOKEN_HEADER. With no claimed email, the call runs under the partner
 * token; with one, it must be backed by a KYC token that verifies (via
 * IDFlow) to that same email before a user-scoped token is minted.
 */
export async function resolveBearerToken(
  claimedEmail: string | null,
  kycAccessToken: string | null,
  idflowApiUrl: string | undefined,
): Promise<string> {
  if (!claimedEmail) return getPartnerToken()

  if (!kycAccessToken) throw new ProxyAuthError(401, 'Missing KYC session for user-scoped request')

  const verifiedEmail = await verifyKycEmail(kycAccessToken, idflowApiUrl)
  if (verifiedEmail.toLowerCase() !== claimedEmail.toLowerCase()) {
    throw new ProxyAuthError(403, 'Requested user does not match authenticated KYC session')
  }

  return getUserToken({ type: 'email', value: verifiedEmail })
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
 * signature. TODO (to be determined): Wirex's own docs
 * (partner.wirexpaychain.com/docs/webhooks-1) state outright that "No
 * authentication headers are added to webhook requests" — there is no
 * signature to check. This URL-secret scheme (configure Wirex's webhook URL
 * as .../wirex/webhook/{WIREX_WEBHOOK_SECRET}) is a stand-in until a proper
 * verification method (IP allowlisting, most likely) is decided on.
 */
export function isValidWebhookSecret(providedSecret: string | undefined, expectedSecret: string): boolean {
  if (!providedSecret) return false

  const providedBuf = Buffer.from(providedSecret, 'utf8')
  const expectedBuf = Buffer.from(expectedSecret, 'utf8')

  // Different lengths would make timingSafeEqual throw rather than return false.
  if (providedBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(providedBuf, expectedBuf)
}
