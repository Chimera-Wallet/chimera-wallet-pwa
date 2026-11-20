// SANDBOX ONLY: credit a Wirex wallet with Wirex's Base Sepolia test tokens,
// via Wirex's sandbox mint service (the same call src/test/live/wirex.live.test.ts
// makes). Used by Settings > Wirex (dev) to test the card top-up's Wirex leg —
// a USDT deposit on the Wirex wallet becoming WUSD card balance — without the
// Arkade Wrap bridge, which has no Base Sepolia leg.
//
// Refuses to run unless WIREX_API_BASE is Wirex's sandbox (.wirexapp.tech), so
// a production Function App can never expose it.
//
// Route note: top-level, not under `wirex/` — that prefix is matched by
// proxy.ts's `wirex/{*restOfPath}` catch-all (see rpcProxy.ts).

import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'

const MINT_URL = 'https://ramc.wirexapp.tech/account/retail/mint'
// Wirex's Base Sepolia test USDT (partner docs, "Useful links"); 18 decimals.
const DEFAULT_TOKEN = '0x2C6c7c00ACa9B9D8446d107367485079b0471706'
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/
const BASE_UNITS = /^[1-9]\d{0,40}$/

export const isSandbox = (apiBase: string | undefined): boolean => {
  if (!apiBase) return false
  try {
    return new URL(apiBase).hostname.endsWith('.wirexapp.tech')
  } catch {
    return false
  }
}

export async function wirexDevMint(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (!isSandbox(process.env.WIREX_API_BASE)) {
    return { status: 404, body: 'Not found' }
  }

  let body: { to?: unknown; amount?: unknown; token?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return { status: 400, body: 'Invalid JSON body' }
  }

  const to = typeof body.to === 'string' ? body.to : ''
  const amount = typeof body.amount === 'string' ? body.amount : ''
  const token = typeof body.token === 'string' ? body.token : DEFAULT_TOKEN
  if (!EVM_ADDRESS.test(to)) return { status: 400, body: 'Invalid `to` address' }
  if (!EVM_ADDRESS.test(token)) return { status: 400, body: 'Invalid `token` address' }
  if (!BASE_UNITS.test(amount)) return { status: 400, body: '`amount` must be a positive integer string (base units)' }

  const response = await fetch(MINT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    // Same shape as the live test's call (chainId as the env string).
    body: JSON.stringify({ chainId: process.env.WIREX_CHAIN_ID, token, to, amount }),
  })
  const text = await response.text()
  if (!response.ok) context.warn(`Wirex sandbox mint failed: ${response.status} ${text}`)

  return {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json' },
    body: text,
  }
}

app.http('wirexDevMint', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'wirex-dev-mint',
  handler: wirexDevMint,
})
