import { describe, expect, it } from 'vitest'
import type { ExtendedVirtualCoin } from '@arkade-os/sdk'
import {
  InsufficientExitFundsError,
  planCollaborativeExit,
  type ExitAnchor,
  type IntentFeeConfig,
} from '../../lib/collaborativeExit'

const DAY_MS = 86_400_000

// The fee programs mainnet's Arkade server published when exits started
// failing with INTENT_INSUFFICIENT_FEE (GET /v1/info, November 2026).
const MAINNET_FEES: IntentFeeConfig = {
  offchainInput: "inputType == 'vtxo' && expiry - now() > 2505216.0 ? amount * 0.002 : 0.0",
  offchainOutput: '',
  onchainInput: '',
  onchainOutput: '200.0',
}

// Mutinynet's equivalent, keyed on the coin's age instead of its expiry.
const MUTINYNET_FEES: IntentFeeConfig = {
  offchainInput: "inputType == 'vtxo' && now() - birth < 86400.0 ? amount * 0.002 : 0.0",
  offchainOutput: '',
  onchainInput: '',
  onchainOutput: '200.0',
}

let nextVout = 0
/** A coin; `fresh` ones expire in 30 days (they owe mainnet's fee), the rest in 10. */
const coin = (value: number, opts: { fresh?: boolean; assets?: boolean; bornDaysAgo?: number } = {}) =>
  ({
    txid: 'aa'.repeat(32),
    vout: nextVout++,
    value,
    createdAt: new Date(Date.now() - (opts.bornDaysAgo ?? 20) * DAY_MS),
    expiresAt: new Date(Date.now() + (opts.fresh ? 30 : 10) * DAY_MS),
    isSwept: false,
    virtualStatus: { state: 'settled' },
    assets: opts.assets ? [{ assetId: 'bb'.repeat(32), amount: BigInt(1) }] : undefined,
  }) as unknown as ExtendedVirtualCoin

const plan = (coins: ExtendedVirtualCoin[], anchor: ExitAnchor, intentFee: IntentFeeConfig = MAINNET_FEES) =>
  planCollaborativeExit({
    coins,
    intentFee,
    destination: 'bc1qdestination',
    destinationScript: '0014' + '11'.repeat(20),
    changeAddress: 'ark1change',
    changeScript: '5120' + '22'.repeat(32),
    dust: 330,
    anchor,
  })

const amounts = (p: ReturnType<typeof plan>) => p.outputs.map((o) => [o.address, Number(o.amount)])

describe('planCollaborativeExit', () => {
  it('pays the input fee mainnet charges on a fresh coin, not just the exit fee', () => {
    // The production failure: "got 200 min expected 12400" for a 6.1M-sat coin.
    const p = plan([coin(6_100_000, { fresh: true })], { debit: 100_000 })
    expect(p.fees).toBe(12_400)
    expect(p.debit).toBe(100_000)
    expect(p.deliver).toBe(87_600)
    expect(amounts(p)).toEqual([
      ['bc1qdestination', 87_600],
      ['ark1change', 6_000_000],
    ])
    // What the intent declares: inputs minus outputs.
    const declared = p.inputs.reduce((s, c) => s + c.value, 0) - p.outputs.reduce((s, o) => s + Number(o.amount), 0)
    expect(declared).toBe(12_400)
  })

  it('spends a coin that owes no input fee before one that does', () => {
    const fresh = coin(6_100_000, { fresh: true })
    const old = coin(200_000)
    const p = plan([fresh, old], { debit: 100_000 })
    expect(p.inputs).toEqual([old])
    expect(p.fees).toBe(200)
    expect(p.deliver).toBe(99_800)
  })

  it('applies the age-based mutinynet program', () => {
    const p = plan([coin(100_000, { bornDaysAgo: 0 })], { debit: 50_000 }, MUTINYNET_FEES)
    expect(p.fees).toBe(400)
    expect(p.deliver).toBe(49_600)
  })

  it('delivers an exact amount with the fees on top', () => {
    const p = plan([coin(100_000, { fresh: true })], { deliver: 50_000 })
    expect(p.deliver).toBe(50_000)
    expect(p.fees).toBe(400)
    expect(p.debit).toBe(50_400)
    expect(amounts(p)).toEqual([
      ['bc1qdestination', 50_000],
      ['ark1change', 49_600],
    ])
  })

  it('sends a sub-dust change to the destination when the amount spent is fixed', () => {
    const p = plan([coin(100_100)], { debit: 100_000 })
    expect(p.outputs).toHaveLength(1)
    expect(p.deliver).toBe(99_900)
    expect(p.debit).toBe(100_100)
    expect(p.fees).toBe(200)
  })

  it('sends a sub-dust change to the fee when the amount delivered is fixed', () => {
    const p = plan([coin(50_500)], { deliver: 50_000 })
    expect(p.outputs).toHaveLength(1)
    expect(p.deliver).toBe(50_000)
    expect(p.fees).toBe(500)
  })

  it('spends plain coins before coins carrying assets', () => {
    const assetCoin = coin(330, { assets: true })
    const plain = coin(100_000)
    const p = plan([assetCoin, plain], { debit: 100_000 })
    expect(p.inputs).toEqual([plain])
  })

  it('refuses an exit that would leave assets without a change output to hold them', () => {
    const coins = [coin(100_000), coin(330, { assets: true })]
    expect(() => plan(coins, { deliver: 99_900 })).toThrow(InsufficientExitFundsError)
  })

  it('keeps assets on a change output of at least dust', () => {
    const assetCoin = coin(1_000, { assets: true })
    const p = plan([coin(100_000), assetCoin], { deliver: 99_900 })
    expect(p.inputs).toContain(assetCoin)
    expect(Number(p.outputs[1].amount)).toBeGreaterThanOrEqual(330)
  })

  it('reports insufficient funds once input fees are counted', () => {
    // 100,000 sats on a fresh coin can't deliver 99,700: that needs 99,900 + a 200 input fee.
    expect(() => plan([coin(100_000, { fresh: true })], { deliver: 99_700 })).toThrow(
      /at most 99600 sats can be sent after fees/,
    )
    expect(() => plan([coin(100_000)], { debit: 100_001 })).toThrow(InsufficientExitFundsError)
  })

  it('refuses an amount that is below dust after fees', () => {
    expect(() => plan([coin(10_000)], { debit: 500 })).toThrow(/below the 330 sat minimum/)
    expect(() => plan([coin(10_000)], { deliver: 300 })).toThrow(/below the 330 sat minimum/)
  })

  it('skips a coin worth less than its own fee', () => {
    const dustCoin = coin(100, { fresh: true })
    const fees = { ...MAINNET_FEES, offchainInput: "inputType == 'vtxo' ? 150.0 : 0.0" }
    const p = plan([dustCoin, coin(100_000)], { debit: 50_000 }, fees)
    expect(p.inputs).not.toContain(dustCoin)
  })

  it('charges nothing when the server publishes no fees', () => {
    const p = plan([coin(100_000)], { debit: 60_000 }, {})
    expect(p.fees).toBe(0)
    expect(p.deliver).toBe(60_000)
  })
})
