// Rewrites Wirex's remote SDK config so the browser reads on-chain data
// through our own backend instead of hitting Wirex's RPC nodes directly.
//
// @wirexapp/wpay-baas-sdk (see ../../src/lib/wirexWallet.ts) fetches its
// RemoteConfig from Wirex at createSDK() time and builds its viem client
// from each chain's `rpcUrl` (e.g. https://node-base.wirexapp.tech for the
// sandbox chain) — a host that sends no CORS headers for our origin, so a
// browser-side read like retrieveAllTokensV2() fails outright. createSDK's
// only escape hatch is `configUrl`, which fully replaces where it fetches
// the config from — so this route fetches Wirex's real config server-side
// (no CORS enforcement here), swaps out just the rpcUrl fields for
// rpcProxy.ts below, and hands the rest back unmodified.
//
// Only rpcUrl is rewritten. bundlerUrl/paymasterUrl/rpcWsUrl point at the
// same kind of Wirex-hosted infrastructure and could hit the same CORS wall
// once account deployment gets further (submitting the actual
// UserOperation) — if so, they'll need the same treatment, and rpcWsUrl
// (a websocket) would need a WS-capable proxy rather than this fetch-based
// one.

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'

interface ChainConfig {
  rpcUrl: string
  [key: string]: unknown
}

interface RemoteConfig {
  defaultChain?: ChainConfig
  chains?: Record<string, ChainConfig>
  [key: string]: unknown
}

// A relative path resolves against the SPA's own origin once viem's http
// transport calls fetch() on it — the same trick ../../src/lib/wirex.ts's
// request() already relies on for its own proxy calls.
const toProxiedRpcUrl = (realRpcUrl: string): string => `/api/wirex-rpc-proxy?target=${encodeURIComponent(realRpcUrl)}`

const proxyChain = (chain: ChainConfig): ChainConfig => ({ ...chain, rpcUrl: toProxiedRpcUrl(chain.rpcUrl) })

export async function wirexConfigProxy(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const apiBase = process.env.WIREX_API_BASE
  if (!apiBase) {
    return { status: 500, body: 'Missing WIREX_API_BASE configuration' }
  }

  const upstream = await fetch(`${apiBase}/api/v1/config`, { headers: { Accept: 'application/json' } })
  if (!upstream.ok) {
    context.error(`Wirex config fetch failed: ${upstream.status}`)
    return { status: upstream.status, body: await upstream.text() }
  }

  const config = (await upstream.json()) as RemoteConfig

  if (config.defaultChain) config.defaultChain = proxyChain(config.defaultChain)
  if (config.chains) {
    config.chains = Object.fromEntries(Object.entries(config.chains).map(([id, chain]) => [id, proxyChain(chain)]))
  }

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  }
}

// Deliberately NOT nested under `wirex/` (e.g. `wirex/config`): that prefix
// is also matched by proxy.ts's `wirex/{*restOfPath}` catch-all, and the two
// routes' precedence turned out to be inconsistent in practice — a POST to
// a same-shaped `wirex/rpc-proxy` route lost to the catch-all and got
// forwarded straight to Wirex's real API instead of reaching our handler,
// while a GET to `wirex/config` happened to win. Using a separate top-level
// route avoids depending on that resolution order at all.
app.http('wirexConfigProxy', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'wirex-config',
  handler: wirexConfigProxy,
})
