// Live-endpoint tests for src/lib/wirex.ts — unlike src/test/lib/wirex.test.ts
// (which mocks `fetch` and only proves wirex.ts *constructs* the request the
// docs describe), these hit a locally running `func start` (api/wirex/proxy.ts),
// which forwards to Wirex's real sandbox API using the WIREX_CLIENT_ID/SECRET
// configured in api/local.settings.json. This is what actually proves the
// live API still matches what the docs (and wirex.ts) assume.
//
// Setup:
//   1. Configure api/local.settings.json with real sandbox credentials
//      (`func settings add WIREX_API_BASE/WIREX_CLIENT_ID/WIREX_CLIENT_SECRET/WIREX_CHAIN_ID ...`)
//      and run `cd api && pnpm start` (func start) in another terminal.
//   2. From the repo root: `WIREX_LIVE_EMAIL=your-sandbox-test-email pnpm test:wirex-live`
//
// Env vars:
//   WIREX_LIVE_EMAIL         required. Sandbox test user's email — the whole
//                            suite is skipped if unset. ensureWirexUser
//                            creates this user once, then reuses it on every
//                            later run (get-before-create).
//   WIREX_LIVE_API_BASE      optional, default http://localhost:7071 — base
//                            URL of the running `func start` instance.
//   WIREX_LIVE_MUTATE        optional. Set to 'true' to also run tests that
//                            create real sandbox resources (issuing a card).
//                            Off by default so a routine run can't spam your
//                            sandbox account with cards.
//   WIREX_LIVE_TOKEN_ADDRESS optional. An on-chain token address valid on the
//                            sandbox chain, needed only for the
//                            transfer-estimate test (also gated on MUTATE).
//
// transferToCard (POST /api/v1/cards/transfer) moves real on-chain value onto
// a card — it is never called automatically here, even under
// WIREX_LIVE_MUTATE=true. To verify it, call it manually with a fresh
// estimation_id from the estimate test below.
import { describe, expect, it, beforeAll } from 'vitest'
import {
  getWirexUserByEmail,
  ensureWirexUser,
  getWirexWallet,
  getWirexCards,
  issueVirtualCard,
  getWirexCardLimits,
  estimateCardTransfer,
} from '../../lib/wirex'

const LIVE_API_BASE = process.env.WIREX_LIVE_API_BASE ?? 'http://localhost:7071'
const TEST_EMAIL = process.env.WIREX_LIVE_EMAIL
const MUTATE = process.env.WIREX_LIVE_MUTATE === 'true'
const TOKEN_ADDRESS = process.env.WIREX_LIVE_TOKEN_ADDRESS

// wirex.ts's request() calls fetch() with a proxy-relative path
// (/api/wirex/...) since in the browser that resolves against the current
// origin. Node's fetch has no such origin to resolve against, so this
// prefixes every relative call with LIVE_API_BASE — the only "live-test-only"
// change; wirex.ts itself is used completely unmodified otherwise.
const nodeFetch = globalThis.fetch
globalThis.fetch = ((input: unknown, init?: RequestInit) => {
  const url = typeof input === 'string' && input.startsWith('/') ? `${LIVE_API_BASE}${input}` : (input as string)
  return nodeFetch(url, init)
}) as typeof fetch

describe.skipIf(!TEST_EMAIL)('wirex.ts live sandbox contract (requires func start + WIREX_LIVE_EMAIL)', () => {
  beforeAll(() => {
    // eslint-disable-next-line no-console
    console.log(`[wirex live tests] proxying through ${LIVE_API_BASE}, test user: ${TEST_EMAIL}`)
  })

  it('mints a partner token and resolves an unknown email to null (proves creds + proxy work)', async () => {
    const result = await getWirexUserByEmail(`nonexistent-${Date.now()}@wirex-live-test.invalid`)
    expect(result).toBeNull()
  })

  it('ensureWirexUser get-or-creates the sandbox test user with the documented shape', async () => {
    const user = await ensureWirexUser({ email: TEST_EMAIL!, firstName: 'Live', lastName: 'Test' })
    expect(user).not.toBeNull()
    expect(user!.email).toBe(TEST_EMAIL)
    expect(typeof user!.user_id).toBe('string')
    expect(typeof user!.user_address).toBe('string')
    expect(typeof user!.chain_id).toBe('number')
  })

  it('getWirexWallet returns null or a wallet-shaped object for the test user', async () => {
    const wallet = await getWirexWallet(TEST_EMAIL!)
    if (wallet !== null) {
      expect(typeof wallet.wallet_address).toBe('string')
    }
  })

  it('getWirexCards returns the documented `data` envelope', async () => {
    const result = await getWirexCards(TEST_EMAIL!)
    expect(result).not.toBeNull()
    expect(Array.isArray(result!.data)).toBe(true)
    for (const card of result!.data) {
      expect(typeof card.id).toBe('string')
      expect(typeof card.status).toBe('string')
      expect(typeof card.card_data).toBe('object')
    }
  })

  // Everything above is read-only. Card issuance is a real sandbox mutation
  // (a new card resource per run), so it's opt-in only.
  describe.skipIf(!MUTATE)('mutating (WIREX_LIVE_MUTATE=true)', () => {
    it('issueVirtualCard creates a card that then shows up in getWirexCards', async () => {
      const issued = await issueVirtualCard({ email: TEST_EMAIL!, cardName: 'wirex-live-test' })
      expect(issued).not.toBeNull()
      expect(typeof issued!.id).toBe('string')

      const { data: cards } = (await getWirexCards(TEST_EMAIL!))!
      expect(cards.some((card) => card.id === issued!.id)).toBe(true)
    })

    it('getWirexCardLimits returns a shape for an existing card, if any', async () => {
      const { data: cards } = (await getWirexCards(TEST_EMAIL!))!
      if (cards.length === 0) return // nothing to check limits on yet
      const limits = await getWirexCardLimits(TEST_EMAIL!, cards[0].id)
      // Shape is unconfirmed against sandbox (see WirexCardLimits's comment) —
      // this only proves the call is accepted (no 400/404 on the path), not
      // any particular field.
      expect(limits === null || typeof limits === 'object').toBe(true)
    })

    // estimateCardTransfer only quotes a price — it doesn't move value, so
    // it's safe to run whenever a card + token address are available.
    // Requires WIREX_LIVE_TOKEN_ADDRESS since there's no way to discover a
    // valid on-chain token address for the sandbox chain from the API itself.
    it.skipIf(!TOKEN_ADDRESS)('estimateCardTransfer returns the documented estimate shape', async () => {
      const { data: cards } = (await getWirexCards(TEST_EMAIL!))!
      if (cards.length === 0) return // nothing to estimate a transfer for yet

      const estimate = await estimateCardTransfer({
        email: TEST_EMAIL!,
        cardId: cards[0].id,
        amount: '0.01',
        tokenAddresses: [TOKEN_ADDRESS!],
      })
      expect(estimate).not.toBeNull()
      expect(typeof estimate!.estimation_id).toBe('string')
      expect(typeof estimate!.expires_at).toBe('number')
    })

    // transferToCard (POST /api/v1/cards/transfer) actually executes the
    // estimate above and moves real on-chain value onto the card — that's
    // deliberately NOT automated here, even under this mutate flag. If you
    // need to verify it, call transferToCard({ email, estimationId, tokenAddress })
    // manually with a fresh estimation_id from the test above.
  })
})
