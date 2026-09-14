"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyAuthError = exports.HOP_BY_HOP_REQUEST_HEADERS = exports.KYC_TOKEN_HEADER = exports.USER_EMAIL_HEADER = void 0;
exports.verifyKycEmail = verifyKycEmail;
exports.resolveBearerToken = resolveBearerToken;
exports.buildForwardedHeaders = buildForwardedHeaders;
exports.isValidWebhookSecret = isValidWebhookSecret;
// Shared authentication logic for the Wirex integration's two HTTP endpoints
// (proxy.ts, webhook.ts): verifying an inbound Wirex webhook, and verifying a
// proxied request's claimed user identity against IDFlow before minting a
// Wirex "Login as User" token for it (see proxy.ts's header comment for why
// that verification exists).
//
// Deliberately free of any @azure/functions import — everything here takes
// plain strings/Headers rather than HttpRequest, so it can be unit-tested
// with the repo's existing (root) vitest setup without adding test tooling
// to this workspace.
const crypto_1 = require("crypto");
const token_1 = require("./token");
exports.USER_EMAIL_HEADER = 'x-wirex-user-email';
exports.KYC_TOKEN_HEADER = 'x-kyc-access-token';
// Stripped from the outgoing request when proxying to Wirex: standard
// hop-by-hop headers, plus our own two auth headers, which are consumed here
// and must never be forwarded upstream.
exports.HOP_BY_HOP_REQUEST_HEADERS = new Set([
    'host',
    'connection',
    'content-length',
    exports.USER_EMAIL_HEADER,
    exports.KYC_TOKEN_HEADER,
]);
/** Thrown for caller-facing auth failures, as opposed to upstream/Wirex errors. */
class ProxyAuthError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
exports.ProxyAuthError = ProxyAuthError;
/** Resolve the IDFlow-verified email for a caller-supplied IDFlow access token. */
async function verifyKycEmail(accessToken, idflowApiUrl) {
    if (!idflowApiUrl)
        throw new Error('Missing IDFLOW_API_URL configuration');
    const res = await fetch(`${idflowApiUrl}/api/Entity/me`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (!res.ok)
        throw new ProxyAuthError(401, 'Invalid or expired KYC session');
    const profile = (await res.json());
    if (!profile.email)
        throw new ProxyAuthError(401, 'IDFlow session has no verified email');
    return profile.email;
}
/**
 * Resolve which bearer token a proxied Wirex call should run under.
 * `claimedEmail`/`kycAccessToken` come from the proxy's USER_EMAIL_HEADER /
 * KYC_TOKEN_HEADER. With no claimed email, the call runs under the partner
 * token; with one, it must be backed by a KYC token that verifies (via
 * IDFlow) to that same email before a user-scoped token is minted.
 */
async function resolveBearerToken(claimedEmail, kycAccessToken, idflowApiUrl) {
    if (!claimedEmail)
        return (0, token_1.getPartnerToken)();
    if (!kycAccessToken)
        throw new ProxyAuthError(401, 'Missing KYC session for user-scoped request');
    const verifiedEmail = await verifyKycEmail(kycAccessToken, idflowApiUrl);
    if (verifiedEmail.toLowerCase() !== claimedEmail.toLowerCase()) {
        throw new ProxyAuthError(403, 'Requested user does not match authenticated KYC session');
    }
    return (0, token_1.getUserToken)({ type: 'email', value: verifiedEmail });
}
/** Build the headers to send upstream to Wirex: caller headers minus the hop-by-hop set, plus auth/chain headers. */
function buildForwardedHeaders(requestHeaders, token, chainId) {
    const forwarded = {};
    let hasAcceptHeader = false;
    for (const [key, value] of requestHeaders) {
        const lowerKey = key.toLowerCase();
        if (exports.HOP_BY_HOP_REQUEST_HEADERS.has(lowerKey))
            continue;
        forwarded[key] = value;
        // Headers iteration always lowercases names, so this is the only
        // reliable way to tell whether the caller already sent an Accept header
        // — checking forwarded['Accept'] (capitalized) would never match.
        if (lowerKey === 'accept')
            hasAcceptHeader = true;
    }
    forwarded['Authorization'] = `Bearer ${token}`;
    forwarded['X-Chain-Id'] = chainId;
    if (!hasAcceptHeader)
        forwarded['Accept'] = 'application/json';
    return forwarded;
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
function isValidWebhookSecret(providedSecret, expectedSecret) {
    if (!providedSecret)
        return false;
    const providedBuf = Buffer.from(providedSecret, 'utf8');
    const expectedBuf = Buffer.from(expectedSecret, 'utf8');
    // Different lengths would make timingSafeEqual throw rather than return false.
    if (providedBuf.length !== expectedBuf.length)
        return false;
    return (0, crypto_1.timingSafeEqual)(providedBuf, expectedBuf);
}
