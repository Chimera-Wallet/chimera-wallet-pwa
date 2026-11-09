"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyAuthError = exports.HOP_BY_HOP_REQUEST_HEADERS = exports.USER_WALLET_HEADER = void 0;
exports.resolveBearerToken = resolveBearerToken;
exports.buildForwardedHeaders = buildForwardedHeaders;
exports.isValidWebhookSecret = isValidWebhookSecret;
// Shared authentication logic for the Wirex integration's two HTTP endpoints
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
 * signature.
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
