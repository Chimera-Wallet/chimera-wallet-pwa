// Authenticated reverse proxy to Wirex's BaaS API — mirrors
// api/coingecko/index.ts's verbatim-forward shape, but also injects
// whichever bearer token (partner or user) the call needs, so the SPA never
// holds a Wirex client_secret or bearer token itself.
//
// Route note: this is registered on the wildcard `wirex/{*restOfPath}` while
// webhook.ts registers the more specific `wirex/webhook/{secret}`. Azure
// Functions' routing (built on ASP.NET Core routing) matches more specific
// route templates before catch-alls, so a request to
// /api/wirex/webhook/<secret> should reach webhook.ts, not this proxy —
// verified locally with `func start` before relying on it in production.

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { ProxyAuthError, USER_WALLET_HEADER, buildForwardedHeaders, resolveBearerToken } from './auth'

export async function wirexProxy(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const apiBase = process.env.WIREX_API_BASE
  const chainId = process.env.WIREX_CHAIN_ID
  if (!apiBase || !chainId) {
    return { status: 500, body: 'Missing WIREX_API_BASE or WIREX_CHAIN_ID configuration' }
  }

  let token: string
  try {
    token = await resolveBearerToken(request.headers.get(USER_WALLET_HEADER), chainId)
  } catch (err) {
    if (err instanceof ProxyAuthError) {
      context.warn('Wirex proxy auth rejected', err.message)
      return { status: err.status, body: err.message }
    }
    context.error('Wirex token resolution failed', err)
    return { status: 502, body: 'Failed to authenticate with Wirex' }
  }

  const subPath = request.params.restOfPath ?? ''
  const queryString = request.url.includes('?') ? '?' + request.url.split('?')[1] : ''
  const targetUrl = `${apiBase}/${subPath}${queryString}`

  const forwardedHeaders = buildForwardedHeaders(request.headers, token, chainId)

  context.log(`Proxying ${request.method} to: ${targetUrl}`)

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const response = await fetch(targetUrl, {
    method: request.method,
    headers: forwardedHeaders,
    body: hasBody ? await request.text() : undefined,
  })

  const body = await response.text()

  return {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json' },
    body,
  }
}

app.http('wirexProxy', {
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  authLevel: 'anonymous',
  route: 'wirex/{*restOfPath}',
  handler: wirexProxy,
})
