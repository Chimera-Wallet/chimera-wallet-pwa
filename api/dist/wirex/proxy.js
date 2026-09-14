"use strict";
// Authenticated reverse proxy to Wirex's BaaS API — mirrors
// api/coingecko/index.ts's verbatim-forward shape, but also injects
// whichever bearer token (partner or user) the call needs, so the SPA never
// holds a Wirex client_secret or bearer token itself.
//
// The SPA calls /api/wirex/<wirex path>, optionally sending
// X-Wirex-User-Email to indicate "act as this user" (Wirex's "Login as
// User" flow, see token.ts::getUserToken) — that header is consumed here and
// never forwarded upstream. Without it, calls run under the partner token
// (e.g. user lookup/creation, which precede a user having any token of
// their own).
//
// Route note: this is registered on the wildcard `wirex/{*restOfPath}`
// while webhook.ts registers the static `wirex/webhook`. Azure Functions'
// routing (built on ASP.NET Core routing) matches static segments before
// catch-alls, so a request to /api/wirex/webhook should reach webhook.ts,
// not this proxy — verified locally with `func start` before relying on it
// in production.
Object.defineProperty(exports, "__esModule", { value: true });
exports.wirexProxy = wirexProxy;
const functions_1 = require("@azure/functions");
const token_1 = require("./token");
const USER_EMAIL_HEADER = 'x-wirex-user-email';
const USER_WALLET_HEADER = 'x-wirex-user-wallet';
const HOP_BY_HOP_REQUEST_HEADERS = new Set([
    'host',
    'connection',
    'content-length',
    USER_EMAIL_HEADER,
    USER_WALLET_HEADER,
]);
async function resolveBearerToken(request) {
    const email = request.headers.get(USER_EMAIL_HEADER);
    if (email)
        return (0, token_1.getUserToken)({ type: 'email', value: email });
    const wallet = request.headers.get(USER_WALLET_HEADER);
    if (wallet)
        return (0, token_1.getUserToken)({ type: 'wallet', value: wallet });
    return (0, token_1.getPartnerToken)();
}
async function wirexProxy(request, context) {
    const apiBase = process.env.WIREX_API_BASE;
    const chainId = process.env.WIREX_CHAIN_ID;
    if (!apiBase || !chainId) {
        return { status: 500, body: 'Missing WIREX_API_BASE or WIREX_CHAIN_ID configuration' };
    }
    let token;
    try {
        token = await resolveBearerToken(request);
    }
    catch (err) {
        context.error('Wirex token resolution failed', err);
        return { status: 502, body: 'Failed to authenticate with Wirex' };
    }
    const subPath = request.params.restOfPath ?? '';
    const queryString = request.url.includes('?') ? '?' + request.url.split('?')[1] : '';
    const targetUrl = `${apiBase}/${subPath}${queryString}`;
    const forwardedHeaders = {};
    request.headers.forEach((value, key) => {
        if (!HOP_BY_HOP_REQUEST_HEADERS.has(key.toLowerCase()))
            forwardedHeaders[key] = value;
    });
    forwardedHeaders['Authorization'] = `Bearer ${token}`;
    forwardedHeaders['X-Chain-Id'] = chainId;
    forwardedHeaders['Accept'] = forwardedHeaders['Accept'] ?? 'application/json';
    context.log(`Proxying ${request.method} to: ${targetUrl}`);
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    const response = await fetch(targetUrl, {
        method: request.method,
        headers: forwardedHeaders,
        body: hasBody ? await request.text() : undefined,
    });
    const body = await response.text();
    return {
        status: response.status,
        headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json' },
        body,
    };
}
functions_1.app.http('wirexProxy', {
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    authLevel: 'anonymous',
    route: 'wirex/{*restOfPath}',
    handler: wirexProxy,
});
