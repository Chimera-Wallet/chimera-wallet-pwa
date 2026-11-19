import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'

const COINGECKO_BASE = 'https://pro-api.coingecko.com/api/v3'

// This proxy is anonymous (the wallet has no accounts) and spends our CoinGecko
// Pro key, so it forwards only what the wallet itself calls
// (src/lib/coingecko/api.ts), never a caller-chosen path or parameter. CertiK's
// pentest (Oct 2026, CWP-04) found the earlier version relayed any path and
// query string. A new wallet call needs an entry here, or it gets 404/400.

const COIN_ID = /^[a-z0-9-]{1,100}$/
const COIN_IDS = /^[a-z0-9-]{1,100}(,[a-z0-9-]{1,100}){0,49}$/
const CURRENCY = /^[a-z]{3,4}$/
const CURRENCIES = /^[a-z]{3,4}(,[a-z]{3,4}){0,19}$/
const BOOLEAN = /^(true|false)$/
const DAYS = /^([1-9][0-9]{0,4}|max)$/

interface Endpoint {
  /** Fixed upstream path for this request, or null if the path isn't allowed. */
  upstreamPath: (segments: string[]) => string | null
  /** Allowed query parameters: name → pattern; `required` ones must be present. */
  params: Record<string, { pattern: RegExp; required?: boolean }>
  cacheSeconds: number
}

const ENDPOINTS: Endpoint[] = [
  {
    // GET simple/price?ids=…&vs_currencies=…&include_24hr_change=…
    upstreamPath: (s) => (s.length === 2 && s[0] === 'simple' && s[1] === 'price' ? 'simple/price' : null),
    params: {
      ids: { pattern: COIN_IDS, required: true },
      vs_currencies: { pattern: CURRENCIES, required: true },
      include_24hr_change: { pattern: BOOLEAN },
    },
    cacheSeconds: 60,
  },
  {
    // GET coins/{id}/market_chart?vs_currency=…&days=…
    upstreamPath: (s) =>
      s.length === 3 && s[0] === 'coins' && COIN_ID.test(s[1]) && s[2] === 'market_chart'
        ? `coins/${s[1]}/market_chart`
        : null,
    params: {
      vs_currency: { pattern: CURRENCY, required: true },
      days: { pattern: DAYS, required: true },
    },
    cacheSeconds: 300,
  },
]

export type ProxyTarget =
  | { ok: true; url: string; cacheSeconds: number }
  | { ok: false; status: number; error: string }

/** Map a request to its fixed upstream URL, or say why it's refused. */
export function resolveTarget(restOfPath: string, query: URLSearchParams): ProxyTarget {
  const segments = restOfPath.split('/').filter(Boolean)
  for (const endpoint of ENDPOINTS) {
    const path = endpoint.upstreamPath(segments)
    if (!path) continue

    for (const name of new Set(query.keys())) {
      const rule = endpoint.params[name]
      if (!rule) return { ok: false, status: 400, error: `Unsupported parameter: ${name}` }
      const values = query.getAll(name)
      if (values.length !== 1 || !rule.pattern.test(values[0])) {
        return { ok: false, status: 400, error: `Invalid parameter: ${name}` }
      }
    }
    // Rebuilt from the allowlist in a fixed order, so equivalent requests share
    // a cache entry and nothing unvalidated reaches CoinGecko.
    const upstreamQuery = new URLSearchParams()
    for (const [name, rule] of Object.entries(endpoint.params)) {
      const value = query.get(name)
      if (value === null) {
        if (rule.required) return { ok: false, status: 400, error: `Missing parameter: ${name}` }
        continue
      }
      upstreamQuery.set(name, value)
    }
    return { ok: true, url: `${COINGECKO_BASE}/${path}?${upstreamQuery}`, cacheSeconds: endpoint.cacheSeconds }
  }
  return { ok: false, status: 404, error: 'Not found' }
}

// Per instance, in memory: enough to keep repeated or scripted calls off the
// key's quota. Prices barely move within a minute and every wallet asks for the
// same few coins, so most requests never reach CoinGecko.
const MAX_CACHE_ENTRIES = 500
const cache = new Map<string, { expiresAt: number; body: string }>()

// Generous, since mobile carriers put many users behind one address.
const RATE_LIMIT_PER_MINUTE = 120
const MAX_TRACKED_CLIENTS = 10_000
const hits = new Map<string, { windowStart: number; count: number }>()

const clientKey = (request: HttpRequest): string => {
  const forwarded = request.headers.get('x-azure-clientip') ?? request.headers.get('x-forwarded-for') ?? ''
  const first = forwarded.split(',')[0].trim()
  // Strip an IPv4 port ("1.2.3.4:5678"); leave IPv6 alone.
  return (first.includes('.') ? first.replace(/:\d+$/, '') : first) || 'unknown'
}

export function isRateLimited(key: string, now = Date.now()): boolean {
  const entry = hits.get(key)
  if (!entry || now - entry.windowStart >= 60_000) {
    if (hits.size >= MAX_TRACKED_CLIENTS) {
      for (const [k, v] of hits) if (now - v.windowStart >= 60_000) hits.delete(k)
      if (hits.size >= MAX_TRACKED_CLIENTS) hits.clear()
    }
    hits.set(key, { windowStart: now, count: 1 })
    return false
  }
  entry.count += 1
  return entry.count > RATE_LIMIT_PER_MINUTE
}

const json = (status: number, body: string, extra: Record<string, string> = {}): HttpResponseInit => ({
  status,
  headers: { 'Content-Type': 'application/json', ...extra },
  body,
})

export async function coingeckoProxy(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const apiKey = process.env.COINGECKO_API_KEY
  if (!apiKey) {
    return json(500, JSON.stringify({ error: 'Missing COINGECKO_API_KEY configuration' }))
  }

  const target = resolveTarget(request.params.restOfPath ?? '', request.query)
  if (!target.ok) return json(target.status, JSON.stringify({ error: target.error }))

  // Without a client address every user would share one bucket, so skip the
  // limit then (the allowlist and cache still bound what reaches CoinGecko).
  const client = clientKey(request)
  if (client !== 'unknown' && isRateLimited(client)) {
    return json(429, JSON.stringify({ error: 'Too many requests' }), { 'Retry-After': '60' })
  }

  const now = Date.now()
  const cached = cache.get(target.url)
  if (cached && cached.expiresAt > now) return json(200, cached.body)

  context.log(`Proxying to: ${target.url}`)

  const response = await fetch(target.url, {
    headers: {
      'x-cg-pro-api-key': apiKey,
      Accept: 'application/json',
    },
  })

  const body = await response.text()

  if (response.ok) {
    if (cache.size >= MAX_CACHE_ENTRIES) {
      for (const [k, v] of cache) if (v.expiresAt <= now) cache.delete(k)
      if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string)
    }
    cache.set(target.url, { expiresAt: now + target.cacheSeconds * 1000, body })
  }

  return json(response.status, body)
}

app.http('coingecko', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'coingecko/{*restOfPath}',
  handler: coingeckoProxy,
})
