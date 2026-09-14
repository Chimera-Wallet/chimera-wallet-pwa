// Wirex webhook receiver — signature validation + logging only for now.
//
// State persistence (e.g. Azure Table Storage rows the SPA can poll) is
// deliberately deferred to a later phase; this skeleton just proves the
// endpoint is reachable and rejects unsigned/forged calls.
//
// TODO: confirm the exact signature scheme (header name, hash algorithm,
// whether the signature covers the raw body or a canonicalized form) against
// Wirex's webhook documentation / partner onboarding call before go-live —
// this implementation assumes a hex-encoded HMAC-SHA256 of the raw body in
// an `X-Wirex-Signature` header, which is the common default but is not yet
// confirmed against Wirex's own docs.

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { createHmac, timingSafeEqual } from 'crypto'

const SIGNATURE_HEADER = 'x-wirex-signature'

function isValidSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const expectedBuf = Buffer.from(expected, 'utf8')
  const actualBuf = Buffer.from(signatureHeader, 'utf8')

  // Different lengths would make timingSafeEqual throw rather than return false.
  if (expectedBuf.length !== actualBuf.length) return false
  return timingSafeEqual(expectedBuf, actualBuf)
}

export async function wirexWebhook(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const secret = process.env.WIREX_WEBHOOK_SECRET
  if (!secret) {
    context.error('Missing WIREX_WEBHOOK_SECRET configuration')
    return { status: 500, body: 'Webhook receiver misconfigured' }
  }

  const rawBody = await request.text()
  const signature = request.headers.get(SIGNATURE_HEADER)

  if (!isValidSignature(rawBody, signature, secret)) {
    context.warn('Rejected Wirex webhook with invalid or missing signature')
    return { status: 401, body: 'Invalid signature' }
  }

  context.log('Received Wirex webhook event', rawBody)

  return { status: 200 }
}

app.http('wirexWebhook', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'wirex/webhook',
  handler: wirexWebhook,
})
