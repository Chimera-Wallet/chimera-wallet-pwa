"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPartnerToken = getPartnerToken;
exports.getPartnerCompanyId = getPartnerCompanyId;
exports.getUserToken = getUserToken;
// Wirex BaaS authentication — server-side only.
//
// Two token types, both confirmed against
// docs.wirexapp.com/docs/retail-authentication:
//  1. Partner (S2S) token: a client_credentials exchange via
//     POST {WIREX_API_BASE}/api/v1/token — the same host as every other
//     Wirex BaaS call, not a separate Auth0 tenant (the docs' own example
//     body is just client_id/client_secret/grant_type; no audience).
//  2. User token ("Login as User"): takes no body, just the partner token
//     plus a header identifying which user to issue a token for.
//
// Neither token is ever returned to the browser — proxy.ts calls these
// helpers server-side and attaches whichever token an upstream call needs.
const requireEnv = (name) => {
    const value = process.env[name];
    if (!value)
        throw new Error(`Missing ${name} configuration`);
    return value;
};
// Module-scope cache: safe within a single warm Function instance. Refreshed
// with a 30s safety margin before actual expiry rather than reacting to a 401.
const TOKEN_EXPIRY_MARGIN_MS = 30_000;
let partnerTokenCache = null;
/** Partner-scoped bearer token, cached until shortly before it expires. */
async function getPartnerToken() {
    const now = Date.now();
    if (partnerTokenCache && partnerTokenCache.expiresAt - TOKEN_EXPIRY_MARGIN_MS > now) {
        return partnerTokenCache.accessToken;
    }
    const apiBase = requireEnv('WIREX_API_BASE');
    const clientId = requireEnv('WIREX_CLIENT_ID');
    const clientSecret = requireEnv('WIREX_CLIENT_SECRET');
    const res = await fetch(`${apiBase}/api/v1/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'client_credentials',
        }),
    });
    if (!res.ok) {
        throw new Error(`Wirex partner token exchange failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json());
    partnerTokenCache = { accessToken: body.access_token, expiresAt: now + body.expires_at * 1000 };
    return partnerTokenCache.accessToken;
}
/**
 * The partner's own Wirex company id, read from the partner token's
 * `company_id` claim (e.g. "00000000-0000-0000-1000-000000000005").
 *
 * This is the company the SDK must register user wallets under on-chain —
 * Wirex's POST /api/v2/user checks the Accounts contract for *this* company,
 * not the remote config's shared `defaultCompanyId`. The token comes straight
 * from Wirex over TLS, so its payload is decoded without verifying the
 * signature.
 */
async function getPartnerCompanyId() {
    const token = await getPartnerToken();
    const payload = token.split('.')[1];
    if (!payload)
        throw new Error('Wirex partner token is not a JWT');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof claims.company_id !== 'string' || claims.company_id === '') {
        throw new Error('Wirex partner token has no company_id claim');
    }
    return claims.company_id;
}
const USER_IDENTIFIER_HEADER = {
    wallet: 'X-User-Wallet',
    email: 'X-User-Email',
    userId: 'UserId',
};
// User tokens are not cached here: they're minted per-proxied-request from the
// already-cached partner token, which keeps this module free of a growing
// per-user cache to invalidate. Revisit if per-user call volume makes that
// wasteful.
async function getUserToken(identifier, chainId) {
    const apiBase = requireEnv('WIREX_API_BASE');
    const partnerToken = await getPartnerToken();
    const headerName = USER_IDENTIFIER_HEADER[identifier.type];
    const res = await fetch(`${apiBase}/api/v1/user/authorize`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${partnerToken}`,
            Accept: 'application/json',
            'X-Chain-Id': chainId,
            [headerName]: identifier.value,
        },
    });
    if (!res.ok) {
        throw new Error(`Wirex user token issuance failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json());
    return body.access_token;
}
