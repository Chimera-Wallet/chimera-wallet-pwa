// POST /api/wirex-card-reveal: HTTP binding for cardRevealSession.ts, which
// returns the tokens Wirex's card-details reveal SDK needs, only after Wirex
// has verified the caller's wallet signature.
//
// Route note: top-level, not under `wirex/`, because that prefix is matched by
// proxy.ts's `wirex/{*restOfPath}` catch-all (see devMint.ts / rpcProxy.ts).

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { RevealSessionError, createRevealSession } from './cardRevealSession'

export async function wirexCardReveal(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const apiBase = process.env.WIREX_API_BASE
  const chainId = process.env.WIREX_CHAIN_ID
  if (!apiBase || !chainId) {
    return { status: 500, body: 'Missing WIREX_API_BASE or WIREX_CHAIN_ID configuration' }
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return { status: 400, body: 'Invalid JSON body' }
  }

  try {
    const session = await createRevealSession(body, { apiBase, chainId })
    return {
      status: 200,
      // Tokens must never be cached by the browser, a CDN or a proxy.
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      jsonBody: session,
    }
  } catch (err) {
    if (err instanceof RevealSessionError) {
      context.warn(`Card reveal session rejected: ${err.status} ${err.message}`)
      return { status: err.status, body: err.message }
    }
    context.error('Card reveal session failed', err instanceof Error ? err.message : 'unknown error')
    return { status: 502, body: 'Failed to create card reveal session' }
  }
}

app.http('wirexCardReveal', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'wirex-card-reveal',
  handler: wirexCardReveal,
})
