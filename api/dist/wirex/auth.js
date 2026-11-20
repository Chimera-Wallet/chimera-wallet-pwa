"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyAuthError = exports.FORWARDED_REQUEST_HEADERS = exports.USER_WALLET_HEADER = void 0;
exports.resolveBearerToken = resolveBearerToken;
exports.buildForwardedHeaders = buildForwardedHeaders;
exports.isValidWebhookSecret = isValidWebhookSecret;
// Shared authentication logic for the Wirex integration's two HTTP endpoints
const crypto_1 = require("crypto");
const token_1 = require("./token");
exports.USER_WALLET_HEADER = 'x-wirex-user-wallet';
// The only caller headers forwarded to Wirex (lowercase). An allowlist rather
// than a blocklist: in Azure the request arrives carrying the platform's own
// headers (x-forwarded-*, x-original-url / x-ms-original-url with OUR path,
// x-ms-*, x-arr-*) plus the browser's cookies, none of which Wirex should see
// — and a routing-sensitive gateway can misread them (e.g. resolving the
// called method from x-original-url). Our own USER_WALLET_HEADER is consumed
// by resolveBearerToken and never forwarded; Authorization and X-Chain-Id are
// always set by us, so a caller can't supply or duplicate them.
exports.FORWARDED_REQUEST_HEADERS = new Set([
    'content-type',
    'accept',
    // Partner-token user lookups identify the user with these (see token.ts).
    'x-user-wallet',
    'x-user-email',
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
/**
 * Resolve which bearer token a proxied Wirex call should run under.
 */
async function resolveBearerToken(claimedWallet, chainId) {
    if (!claimedWallet)
        return (0, token_1.getPartnerToken)();
    return (0, token_1.getUserToken)({ type: 'wallet', value: claimedWallet }, chainId);
}
/** Build the headers to send upstream to Wirex: allowlisted caller headers, plus auth/chain headers. */
function buildForwardedHeaders(requestHeaders, token, chainId) {
    const forwarded = {};
    for (const [key, value] of requestHeaders) {
        const lowerKey = key.toLowerCase();
        if (exports.FORWARDED_REQUEST_HEADERS.has(lowerKey))
            forwarded[lowerKey] = value;
    }
    forwarded['authorization'] = `Bearer ${token}`;
    forwarded['x-chain-id'] = chainId;
    forwarded['accept'] ??= 'application/json';
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
