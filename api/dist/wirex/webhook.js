"use strict";
// Wirex webhook receiver — auth + logging only for now.
//
// State persistence (e.g. Azure Table Storage rows the SPA can poll) is
// deliberately deferred to a later phase; this skeleton just proves the
// endpoint is reachable and rejects unauthenticated calls.
//
// Auth: Wirex's own docs (partner.wirexpaychain.com/docs/webhooks-1) state
// outright that "No authentication headers are added to webhook requests" —
// there's no signature scheme to implement. TODO (to be determined): pick a
// real verification method (IP allowlisting is the docs' suggestion). Until
// then, this route takes the shared secret as a URL path segment
// (.../wirex/webhook/{WIREX_WEBHOOK_SECRET}) — configure that exact URL as
// the webhook target in Wirex's partner dashboard for the `wallets` event
// (see ../../src/lib/wirex.ts's Wallet section for why only that event
// matters here). This is a stopgap, not a considered design.
Object.defineProperty(exports, "__esModule", { value: true });
exports.wirexWebhook = wirexWebhook;
const functions_1 = require("@azure/functions");
const auth_1 = require("./auth");
async function wirexWebhook(request, context) {
    const secret = process.env.WIREX_WEBHOOK_SECRET;
    if (!secret) {
        context.error('Missing WIREX_WEBHOOK_SECRET configuration');
        return { status: 500, body: 'Webhook receiver misconfigured' };
    }
    if (!(0, auth_1.isValidWebhookSecret)(request.params.secret, secret)) {
        context.warn('Rejected Wirex webhook with invalid or missing URL secret');
        return { status: 401, body: 'Unauthorized' };
    }
    const rawBody = await request.text();
    context.log('Received Wirex webhook event', rawBody);
    return { status: 200 };
}
functions_1.app.http('wirexWebhook', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'wirex/webhook/{secret}',
    handler: wirexWebhook,
});
