"use strict";
// Authenticated reverse proxy to Wirex's BaaS API — mirrors
// api/coingecko/index.ts's verbatim-forward shape, but also injects
// whichever bearer token (partner or user) the call needs, so the SPA never
// holds a Wirex client_secret or bearer token itself.
//
// The SPA calls /api/wirex/<wirex path>, optionally sending
// X-Wirex-User-Wallet (the EOA/user_address) to indicate "act as this user"
// (Wirex's "Login as User" flow, see token.ts::getUserToken) — that header is
// consumed here and never forwarded upstream. Without it, calls run under the
// partner token (e.g. user lookup/creation, which precede a user having any
// token of their own).
//
// X-Wirex-User-Wallet is trusted as a claim, not verified proof of ownership
// — the app no longer has a KYC session of its own to check it against (see
// ./auth.ts::resolveBearerToken, shared with webhook.ts's auth check, and
// kept free of @azure/functions so it's unit-testable on its own). This is a
// deliberately reduced trust model; revisit if a stronger guarantee is needed.
//
// Route note: this is registered on the wildcard `wirex/{*restOfPath}` while
// webhook.ts registers the more specific `wirex/webhook/{secret}`. Azure
// Functions' routing (built on ASP.NET Core routing) matches more specific
// route templates before catch-alls, so a request to
// /api/wirex/webhook/<secret> should reach webhook.ts, not this proxy —
// verified locally with `func start` before relying on it in production.
Object.defineProperty(exports, "__esModule", { value: true });
exports.wirexProxy = wirexProxy;
const functions_1 = require("@azure/functions");
const auth_1 = require("./auth");
async function wirexProxy(request, context) {
    const apiBase = process.env.WIREX_API_BASE;
    const chainId = process.env.WIREX_CHAIN_ID;
    if (!apiBase || !chainId) {
        return { status: 500, body: 'Missing WIREX_API_BASE or WIREX_CHAIN_ID configuration' };
    }
    let token;
    try {
        token = await (0, auth_1.resolveBearerToken)(request.headers.get(auth_1.USER_WALLET_HEADER), chainId);
    }
    catch (err) {
        if (err instanceof auth_1.ProxyAuthError) {
            context.warn('Wirex proxy auth rejected', err.message);
            return { status: err.status, body: err.message };
        }
        context.error('Wirex token resolution failed', err);
        return { status: 502, body: 'Failed to authenticate with Wirex' };
    }
    const subPath = request.params.restOfPath ?? '';
    const queryString = request.url.includes('?') ? '?' + request.url.split('?')[1] : '';
    const targetUrl = `${apiBase}/${subPath}${queryString}`;
    const forwardedHeaders = (0, auth_1.buildForwardedHeaders)(request.headers, token, chainId);
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
