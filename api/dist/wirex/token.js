"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPartnerToken = getPartnerToken;
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
//     plus a header identifying which user to issue a token for
//     (X-User-Email / UserId), at POST {WIREX_API_BASE}/api/v1/user/authorize.
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
    // eslint-disable-next-line no-console -- TEMPORARY debug aid, remove before commit
    console.log('[wirex] partner token:', partnerTokenCache.accessToken);
    return partnerTokenCache.accessToken;
}
const USER_IDENTIFIER_HEADER = {
    email: 'X-User-Email',
    userId: 'UserId',
};
// User tokens are not cached here: they're minted per-proxied-request from the
// already-cached partner token, which keeps this module free of a growing
// per-user cache to invalidate. Revisit if per-user call volume makes that
// wasteful.
async function getUserToken(identifier) {
    const apiBase = requireEnv('WIREX_API_BASE');
    const partnerToken = await getPartnerToken();
    const headerName = USER_IDENTIFIER_HEADER[identifier.type];
    const res = await fetch(`${apiBase}/api/v1/user/authorize`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${partnerToken}`,
            Accept: 'application/json',
            [headerName]: identifier.value,
        },
    });
    if (!res.ok) {
        throw new Error(`Wirex user token issuance failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json());
    // eslint-disable-next-line no-console -- TEMPORARY debug aid, remove before commit
    console.log('[wirex] user token:', body.access_token);
    return body.access_token;
}
