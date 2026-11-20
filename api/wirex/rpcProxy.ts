// Unauthenticated forwarder for the JSON-RPC calls @wirexapp/wpay-baas-sdk
// makes against Wirex's own chain nodes (e.g. https://node-base.wirexapp.tech).
// Those nodes send no CORS headers for our origin, so the SPA can't call
// them directly — config.ts rewrites the SDK's rpcUrl to point here instead.
// A raw eth_call carries no secrets of its own (it's exactly as public as
// calling the node directly), so unlike proxy.ts this needs no bearer-token
// handling.
//
// `target` is restricted to Wirex's own hosts so this can't be used as an
// open relay to arbitrary URLs (SSRF).
//
// Route note: deliberately NOT nested under `wirex/` (see config.ts's
// routing note) — that prefix is also matched by proxy.ts's
// `wirex/{*restOfPath}` catch-all, and in practice this route's POST lost
// that precedence fight, forwarding straight to Wirex's real API instead of
// reaching this handler. A separate top-level route avoids the ambiguity.

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'

const ALLOWED_RPC_HOST_SUFFIXES = ['.wirexapp.tech', '.wirexapp.com']

export async function wirexRpcProxy(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const target = request.query.get('target')
  if (!target) {
    return { status: 400, body: 'Missing target query parameter' }
  }

  let targetUrl: URL
  try {
    targetUrl = new URL(target)
  } catch {
    return { status: 400, body: 'Invalid target URL' }
  }

  if (!ALLOWED_RPC_HOST_SUFFIXES.some((suffix) => targetUrl.hostname.endsWith(suffix))) {
    context.warn(`Refused to proxy RPC call to disallowed host: ${targetUrl.hostname}`)
    return { status: 400, body: `Refusing to proxy to disallowed host: ${targetUrl.hostname}` }
  }

  const body = await request.text()
  const response = await fetch(targetUrl.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })

  const responseBody = await response.text()

  return {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json' },
    body: responseBody,
  }
}

app.http('wirexRpcProxy', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'wirex-rpc-proxy',
  handler: wirexRpcProxy,
})
