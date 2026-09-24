"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyAuthError = exports.HOP_BY_HOP_REQUEST_HEADERS = exports.USER_WALLET_HEADER = void 0;
exports.resolveBearerToken = resolveBearerToken;
exports.buildForwardedHeaders = buildForwardedHeaders;
exports.isValidWebhookSecret = isValidWebhookSecret;
// Shared authentication logic for the Wirex integration's two HTTP endpoints
// (proxy.ts, webhook.ts): verifying an inbound Wirex webhook, and resolving
// which Wirex bearer token (partner or "Login as User") a proxied request
// should run under.
const crypto_1 = require("crypto");
const token_1 = require("./token");
exports.USER_WALLET_HEADER = 'x-wirex-user-wallet';
// Stripped from the outgoing request when proxying to Wirex: standard
// hop-by-hop headers, plus our own auth header, which is consumed here.
exports.HOP_BY_HOP_REQUEST_HEADERS = new Set(['host', 'connection', 'content-length', exports.USER_WALLET_HEADER]);
/** Thrown for caller-facing auth failures, as opposed to upstream/Wirex errors. */
class ProxyAuthError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
exports.ProxyAuthError = ProxyAuthError;
/**
 * Resolve which bearer token a proxied Wirex call should run under.
 * `claimedWallet` (the EOA/user_address) comes from the proxy's
 * USER_WALLET_HEADER. With no claimed wallet, the call runs under the
 * partner token; with one, a user-scoped "Login as User" token is minted
 * directly for it, identified by wallet rather than email — see token.ts's
 * header comment for why.
 *
 * `claimedWallet` is trusted as-is, not verified against any prior session —
 * the app's KYC flow no longer runs through a provider we can check a wallet
 * address against here, so this is a deliberately reduced trust model versus
 * verifying ownership first. Revisit if a stronger guarantee is needed.
 */
async function resolveBearerToken(claimedWallet, chainId) {
    if (!claimedWallet)
        return (0, token_1.getPartnerToken)();
    return (0, token_1.getUserToken)({ type: 'wallet', value: claimedWallet }, chainId);
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
