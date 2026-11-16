"use strict";
// POST /api/wirex-card-reveal: HTTP binding for cardRevealSession.ts, which
// returns the tokens Wirex's card-details reveal SDK needs, only after Wirex
// has verified the caller's wallet signature.
//
// Route note: top-level, not under `wirex/`, because that prefix is matched by
// proxy.ts's `wirex/{*restOfPath}` catch-all (see devMint.ts / rpcProxy.ts).
Object.defineProperty(exports, "__esModule", { value: true });
exports.wirexCardReveal = wirexCardReveal;
const functions_1 = require("@azure/functions");
const cardRevealSession_1 = require("./cardRevealSession");
async function wirexCardReveal(request, context) {
    const apiBase = process.env.WIREX_API_BASE;
    const chainId = process.env.WIREX_CHAIN_ID;
    if (!apiBase || !chainId) {
        return { status: 500, body: 'Missing WIREX_API_BASE or WIREX_CHAIN_ID configuration' };
    }
    let body;
    try {
        body = await request.json();
    }
    catch {
        return { status: 400, body: 'Invalid JSON body' };
    }
    try {
        const session = await (0, cardRevealSession_1.createRevealSession)(body, { apiBase, chainId });
        return {
            status: 200,
            // Tokens must never be cached by the browser, a CDN or a proxy.
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            jsonBody: session,
        };
    }
    catch (err) {
        if (err instanceof cardRevealSession_1.RevealSessionError) {
            context.warn(`Card reveal session rejected: ${err.status} ${err.message}`);
            return { status: err.status, body: err.message };
        }
        context.error('Card reveal session failed', err instanceof Error ? err.message : 'unknown error');
        return { status: 502, body: 'Failed to create card reveal session' };
    }
}
functions_1.app.http('wirexCardReveal', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'wirex-card-reveal',
    handler: wirexCardReveal,
});
