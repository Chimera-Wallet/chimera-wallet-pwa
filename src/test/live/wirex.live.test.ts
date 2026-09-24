// Known gaps in what this suite can exercise, given this codebase's current
// capabilities:
//
//  - Wallet *deployment* (step 3) is not exercised. deployWirexKernelAccount
//    (../../lib/wirexWallet.ts, via the ZeroDev SDK) needs a real wallet
//    password/mnemonic, a funded signer, and a live bundler/paymaster — not
//    something a repeatable live-endpoint suite should trigger automatically.
//    This suite only checks GET /api/v1/wallet's *lookup* shape, and step 6
//    (mint) only runs when that lookup already found a deployed wallet.
//    Corollary, confirmed live: Wirex's POST /api/v2/user (step 2) validates
//    that the address is already registered in its on-chain Accounts
//    contract — deployWirexKernelAccount is what performs that registration
//    (see ../../providers/wirex.tsx's deployWirexWallet, which now runs it
//    before ensureWirexUser for exactly this reason). Since this suite can't
//    run that deploy, step 2 only succeeds for a WIREX_LIVE_USER_ADDRESS
//    whose wallet was already deployed/registered by some other means — see
//    that env var's doc below.
//  - Metal/physical card issuance is not implemented in ../../lib/wirex.ts
//    (needs a delivery address plus a not-yet-built "create invoice" flow) —
//    not tested here.
//  - Push-to-external-card withdrawal has been removed from this codebase
//    (Wirex deprecated it with no stated replacement) — not tested here.
//  - The webhook (api/wirex/webhook.ts) is log-only and persists no state —
//    not tested here.
//  - The sandbox reference also documents SEPA/ACH bank-deposit helpers and
//    26+ card-transaction-simulation endpoints (purchase/reversal/refund/
//    chargeback etc.) — both out of scope here: this app has no bank-funding
//    flow, and ../../lib/wirex.ts has no function that reads card
//    transactions or the Activities API, so there's no app code those
//    endpoints would exercise.
//  - POST /api/v1/cards/transfer (the actual value-moving execute call) is
//    never called automatically, even under WIREX_LIVE_MUTATE=true — see the
//    comment at the bottom of this file.
import { describe, expect, it, beforeAll } from 'vitest'
import {
  getWirexUserByAddress,
  ensureWirexUser,
  getWirexCardLimits,
  setWirexCardLimits,
  getWirexVerificationLink,
} from '../../lib/wirex'

const WIREX_MINT_API_BASE = 'https://ramc.wirexapp.tech'

const PROXY_BASE = process.env.WIREX_LIVE_PROXY_BASE ?? 'http://localhost:7071'
const TEST_EMAIL = process.env.WIREX_LIVE_EMAIL
const TEST_USER_ADDRESS = process.env.WIREX_LIVE_USER_ADDRESS

const WIREX_API_BASE = process.env.WIREX_API_BASE
const WIREX_CLIENT_ID = process.env.WIREX_CLIENT_ID
const WIREX_CLIENT_SECRET = process.env.WIREX_CLIENT_SECRET
const WIREX_CHAIN_ID = process.env.WIREX_CHAIN_ID
const HAS_DIRECT_CREDS = true

const MUTATE = true
const TOKEN_ADDRESS = process.env.WIREX_LIVE_TOKEN_ADDRESS
const MINT_AMOUNT = process.env.WIREX_LIVE_MINT_AMOUNT ?? '10000000000000000'


const nodeFetch = globalThis.fetch
globalThis.fetch = ((input: unknown, init?: RequestInit) => {
  const url = typeof input === 'string' && input.startsWith('/') ? `${PROXY_BASE}${input}` : (input as string)
  return nodeFetch(url, init)
}) as typeof fetch

describe.skipIf(!TEST_EMAIL || !TEST_USER_ADDRESS)(
  'wirex retail user flow (requires func start + WIREX_LIVE_EMAIL/WIREX_LIVE_USER_ADDRESS)',
  () => {
    beforeAll(() => {
      // eslint-disable-next-line no-console
      console.log(`[wirex live tests] proxy: ${PROXY_BASE}, test user: ${TEST_EMAIL} / ${TEST_USER_ADDRESS}`)
    })

    describe('1. authenticate', () => {
      it('mints a partner token via our proxy (proves creds + token.ts work end-to-end)', async () => {
        // getWirexUserByAddress is the lightest partner-token call available:
        // a successful null result (rather than a thrown auth error) proves
        // the partner token mint + forward succeeded.
        const result = await getWirexUserByAddress(`0x${Date.now().toString(16).padStart(40, '0')}`)
        expect(result).toBeNull()
      })
    })

    describe('2. register the wirex user', () => {
      it('ensureWirexUser get-or-creates the sandbox test user with the documented shape', async () => {
        const user = await ensureWirexUser({
          userAddress: TEST_USER_ADDRESS!,
          email: TEST_EMAIL!,
          firstName: 'Live',
          lastName: 'Test',
        })
        expect(user).not.toBeNull()
        expect(user!.email).toBe(TEST_EMAIL)
        expect(typeof user!.user_id).toBe('string')
        expect(typeof user!.user_address).toBe('string')
        expect(typeof user!.chain_id).toBe('number')

        console.log('[wirex live tests] capabilities:', JSON.stringify(user!.capabilities))
        if (user!.capabilities) {
          expect(Array.isArray(user!.capabilities)).toBe(true)
          for (const capability of user!.capabilities) {
            expect(typeof capability.type).toBe('string')
            expect(typeof capability.status).toBe('string')
          }
        }
      })
    })

    describe('2b. hosted KYC — docs.wirexapp.com/docs/retail-kyc-hosted', () => {
      it('getWirexVerificationLink returns a Sumsub-hosted redirect URL, or confirms the user is already verified', async () => {
        try {
          const url = await getWirexVerificationLink(TEST_USER_ADDRESS!)
          expect(typeof url).toBe('string')
          expect(url.length).toBeGreaterThan(0)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          expect(message).toContain('already verified')
        }
      })
    })

    describe.skipIf(!HAS_DIRECT_CREDS)('direct-to-sandbox steps (bypass our proxy + its KYC gate — see file header)', () => {
      let userToken: string
      // Set by step 3 below if a deployed wallet is found; step 6 (mint)
      // only runs when this is non-null, since minting targets an
      // already-deployed smart wallet's on-chain address.
      let walletAddress: string | null = null

      beforeAll(async () => {
        const partnerRes = await nodeFetch(`${WIREX_API_BASE}/api/v1/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            client_id: WIREX_CLIENT_ID,
            client_secret: WIREX_CLIENT_SECRET,
            grant_type: 'client_credentials',
          }),
        })
        if (!partnerRes.ok) throw new Error(`partner token mint failed: ${partnerRes.status} ${await partnerRes.text()}`)
        const { access_token: partnerToken } = (await partnerRes.json()) as { access_token: string }

        const userRes = await nodeFetch(`${WIREX_API_BASE}/api/v1/user/authorize`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${partnerToken}`,
            Accept: 'application/json',
            'X-User-Wallet': TEST_USER_ADDRESS!,
            'X-Chain-Id': WIREX_CHAIN_ID!,
          },
        })
        if (!userRes.ok) throw new Error(`user token mint failed: ${userRes.status} ${await userRes.text()}`)
        ;({ access_token: userToken } = (await userRes.json()) as { access_token: string })
      })

      const wirexFetch = (path: string, init?: RequestInit) =>
        nodeFetch(`${WIREX_API_BASE}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${userToken}`,
            'X-Chain-Id': WIREX_CHAIN_ID!,
            Accept: 'application/json',
            ...(init?.headers ?? {}),
          },
        })

      describe('3. check wallet status (deployment itself is out of scope — see file header)', () => {
        it('GET /api/v1/wallet returns 200 with a wallet-shaped object, or a not-found response if none has been deployed/indexed yet', async () => {
          const res = await wirexFetch('/api/v1/wallet')
          expect([200, 400, 404]).toContain(res.status)
          if (res.status === 400) {
            const body = await res.json()
            expect(body.error_reason).toBe('ErrorGeneral')
          }
          if (res.status === 200) {
            const wallet = await res.json()
            expect(typeof wallet.wallet_address).toBe('string')
            walletAddress = wallet.wallet_address
          }
        })
      })

      it('GET /api/v1/cards returns the documented `data` envelope', async () => {
        const res = await wirexFetch('/api/v1/cards')
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(Array.isArray(body.data)).toBe(true)
        for (const card of body.data) {
          expect(typeof card.id).toBe('string')
          expect(typeof card.status).toBe('string')
          expect(typeof card.card_data).toBe('object')
        }
      })


      describe.skipIf(!MUTATE)('mutating (WIREX_LIVE_MUTATE=true)', () => {
        describe('4. issue a virtual card', () => {
          it('POST /api/v1/cards/virtual issues a card that then shows up in GET /api/v1/cards (or confirms one already exists)', async () => {
            // The live test user is persistent across runs, so a prior run
            // may have already issued a virtual card — Wirex then refuses a
            // second one (VisaVirtualCard capability shows "Active"), which
            // is the expected steady state, not a bug.
            const existingRes = await wirexFetch('/api/v1/cards')
            const { data: existingCards } = await existingRes.json()
            const existingVirtual = existingCards.find((card: { card_data?: { format?: string } }) => card.card_data?.format === 'Virtual')
            if (existingVirtual) {
              expect(typeof existingVirtual.id).toBe('string')
              return
            }

            const issueRes = await wirexFetch('/api/v1/cards/virtual', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ card_name: 'wirex-live-test' }),
            })
            expect(issueRes.status).toBe(200)
            const issued = await issueRes.json()
            expect(typeof issued.id).toBe('string')

            const cardsRes = await wirexFetch('/api/v1/cards')
            const { data: cards } = await cardsRes.json()
            expect(cards.some((card: { id: string }) => card.id === issued.id)).toBe(true)
          })
        })

        describe('5. read and adjust card limits', () => {
          it('getWirexCardLimits returns null for a card that does not exist', async () => {
            // Must be a syntactically valid UUID — Wirex validates the
            // format before doing the not-found lookup and returns a 400
            // ErrorInvalidField (not ErrorNotFound) for a malformed id.
            const limits = await getWirexCardLimits(TEST_USER_ADDRESS!, '00000000-0000-4000-8000-000000000000')
            expect(limits).toBeNull()
          })

          it('reads an existing card\'s limits, and confirms a change via setWirexCardLimits is reflected back', async () => {
            const cardsRes = await wirexFetch('/api/v1/cards')
            const { data: cards } = await cardsRes.json()
            if (cards.length === 0) return // nothing to check/adjust limits on yet
            const cardId = cards[0].id

            const before = await getWirexCardLimits(TEST_USER_ADDRESS!, cardId)
            expect(before === null || typeof before === 'object').toBe(true)

            const nextDailyLimit = before?.daily_limit === 500 ? 600 : 500
            await setWirexCardLimits(TEST_USER_ADDRESS!, cardId, { dailyLimit: nextDailyLimit })

            const after = await getWirexCardLimits(TEST_USER_ADDRESS!, cardId)
            expect(after?.daily_limit).toBe(nextDailyLimit)
          })
        })

        describe('6. mint test funds onto the wallet', () => {
          it.skipIf(!TOKEN_ADDRESS)('POST /account/retail/mint credits the wallet with sandbox test funds', async () => {
            if (!walletAddress) return // no deployed wallet to fund yet

            const mintRes = await nodeFetch(`${WIREX_MINT_API_BASE}/account/retail/mint`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({
                chainId: WIREX_CHAIN_ID,
                token: TOKEN_ADDRESS,
                to: walletAddress,
                amount: MINT_AMOUNT,
              }),
            })
            expect(
              mintRes.ok,
              `mint failed: ${mintRes.status} ${await mintRes.text()} (auth requirements for this sandbox-only endpoint are undocumented — a 401/403 may mean it needs credentials this suite doesn't send)`,
            ).toBe(true)
          })
        })

        describe('7. quote a transfer onto the card', () => {
          it.skipIf(!TOKEN_ADDRESS)('POST /api/v1/cards/transfer/estimate returns the documented estimate shape', async () => {
            const cardsRes = await wirexFetch('/api/v1/cards')
            const { data: cards } = await cardsRes.json()
            if (cards.length === 0) return // nothing to estimate a transfer for yet

            const estimateRes = await wirexFetch('/api/v1/cards/transfer/estimate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ amount: 0.01, external_card_id: cards[0].id, tokens: [TOKEN_ADDRESS] }),
            })
            expect(estimateRes.status).toBe(200)
            const estimate = await estimateRes.json()
            expect(typeof estimate.estimation_id).toBe('string')
            expect(typeof estimate.expires_at).toBe('number')
          })
        })
      })
    })
  },
)
