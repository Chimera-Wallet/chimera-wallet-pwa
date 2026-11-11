import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IWallet } from '@arkade-os/sdk'
import * as bridge from '../../lib/arkadeWrap'
import * as asp from '../../lib/asp'
import { getWirexWallet } from '../../lib/wirex'
import { getSourceChains } from '../../lib/sourceChains'
import {
  TopUpBelowMinimumError,
  estimateTopUpPayout,
  fundWirexTopUp,
  readPendingTopUps,
  savePendingTopUp,
  trackWirexTopUp,
  type PendingTopUp,
} from '../../screens/Apps/WirexCard/topUp'

vi.mock('../../lib/wirex', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/wirex')>()),
  getWirexWallet: vi.fn(),
}))

const receiver = '0x1111111111111111111111111111111111111111'
const wallet = {} as IWallet
let quote: bridge.WrapQuote

const makeQuote = (overrides: Partial<bridge.WrapQuote> = {}): bridge.WrapQuote => ({
  id: 'q1',
  type: 'unwrap',
  chain: 'base',
  ticker: 'USDT-CX',
  sender: 'ark1sender',
  receiver,
  treasury: 'ark1treasury',
  status: 'pending',
  amount: null,
  fee_amount: null,
  payout_amount: null,
  min_amount: '1000000',
  network_fee_amount: '100000',
  deposit_tx_hash: null,
  mint_tx_hash: null,
  burn_tx_hash: null,
  payout_tx_hash: null,
  expiry: Date.now() + 60_000,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.stubEnv('VITE_WIREX_DEPOSIT_CHAIN', 'base')
  quote = makeQuote()
  vi.spyOn(bridge, 'createUnwrapQuote').mockImplementation(async () => quote)
  vi.spyOn(bridge, 'getWrapQuote').mockImplementation(async () => quote)
  vi.spyOn(asp, 'sendAssets').mockResolvedValue('ark-txid')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Base chain registration', () => {
  it('is not offered in the general USDT send/receive pickers', () => {
    expect(getSourceChains('USDT').map((o) => o.chain.id)).not.toContain('base')
  })
})

describe('fundWirexTopUp', () => {
  const fund = (amount = BigInt(5_000_000), existing?: bridge.WrapQuote) =>
    fundWirexTopUp({ wallet, sender: 'ark1sender', receiver, symbol: 'USDT', amount, quote: existing })

  it('quotes USDT on the configured chain to the Wirex wallet and funds the treasury', async () => {
    const result = await fund()
    expect(bridge.createUnwrapQuote).toHaveBeenCalledWith({
      chain: 'base',
      ticker: 'USDT',
      sender: 'ark1sender',
      receiver,
    })
    expect(asp.sendAssets).toHaveBeenCalledWith(wallet, 'ark1treasury', [
      { assetId: 'test-usdt', amount: BigInt(5_000_000) },
    ])
    expect(result).toEqual({ quote, txid: 'ark-txid' })
  })

  it('rejects an amount below the bridge minimum without sending', async () => {
    await expect(fund(BigInt(999_999))).rejects.toBeInstanceOf(TopUpBelowMinimumError)
    expect(asp.sendAssets).not.toHaveBeenCalled()
  })

  it('replaces an expired reserved quote', async () => {
    const expired = makeQuote({ id: 'old', status: 'expired' })
    vi.mocked(bridge.getWrapQuote).mockResolvedValueOnce(expired)
    const result = await fund(BigInt(5_000_000), expired)
    expect(bridge.createUnwrapQuote).toHaveBeenCalledTimes(1)
    expect(result.quote.id).toBe('q1')
  })

  it('replaces a reserved quote for a different receiver', async () => {
    const other = makeQuote({ id: 'other', receiver: '0x2222222222222222222222222222222222222222' })
    vi.mocked(bridge.getWrapQuote).mockResolvedValueOnce(other)
    await fund(BigInt(5_000_000), other)
    expect(bridge.createUnwrapQuote).toHaveBeenCalledTimes(1)
  })

  it('never funds a quote that already saw a deposit', async () => {
    const deposited = makeQuote({ status: 'deposited', deposit_tx_hash: 'dep' })
    vi.mocked(bridge.getWrapQuote).mockResolvedValueOnce(deposited)
    const result = await fund(BigInt(5_000_000), deposited)
    expect(asp.sendAssets).not.toHaveBeenCalled()
    expect(result).toEqual({ quote: deposited })
  })

  it('fails clearly when the deposit chain is not configured', async () => {
    vi.stubEnv('VITE_WIREX_DEPOSIT_CHAIN', '')
    await expect(fund()).rejects.toThrow('VITE_WIREX_DEPOSIT_CHAIN')
  })
})

describe('estimateTopUpPayout', () => {
  it('deducts the service fee (rounded up) and the network fee', () => {
    // 10 USDT - 0.3% (0.03) - 0.1 network fee
    expect(estimateTopUpPayout(BigInt(10_000_000), quote, 0.3)).toBe(BigInt(9_870_000))
  })

  it('never goes negative', () => {
    expect(estimateTopUpPayout(BigInt(50_000), quote, 0.3)).toBe(BigInt(0))
  })
})

describe('trackWirexTopUp', () => {
  const pending: PendingTopUp = {
    quoteId: 'q1',
    txid: 'ark-txid',
    userAddress: '0xUser',
    symbol: 'USDT',
    amount: '5000000',
    baselineWusd: 10,
    createdAt: 0,
    phase: 'bridging',
  }
  const wirexWallet = (wusd: number) => ({
    wallet_address: receiver,
    balances: [{ token_symbol: 'WUSD', token_address: '0xWusd', balance: wusd }],
  })
  const fast = { bridgePollMs: 1, creditPollMs: 1 }

  it('waits for the payout, then for WUSD to rise, then clears the record', async () => {
    vi.mocked(bridge.getWrapQuote)
      .mockResolvedValueOnce(makeQuote({ status: 'processing' }))
      .mockResolvedValue(makeQuote({ status: 'completed', payout_tx_hash: '0xpayout' }))
    vi.mocked(getWirexWallet).mockResolvedValueOnce(wirexWallet(10)).mockResolvedValue(wirexWallet(14.9))
    savePendingTopUp(pending)
    const phases: string[] = []

    const final = await trackWirexTopUp(pending, { ...fast, onUpdate: (p) => phases.push(p.phase) })

    expect(phases).toEqual(['crediting', 'credited'])
    expect(final).toMatchObject({ phase: 'credited', payoutTxHash: '0xpayout' })
    expect(readPendingTopUps('0xUser')).toEqual([])
  })

  it('reports a failed bridge quote', async () => {
    vi.mocked(bridge.getWrapQuote).mockResolvedValue(makeQuote({ status: 'failed' }))
    const final = await trackWirexTopUp(pending, fast)
    expect(final.phase).toBe('failed')
    expect(getWirexWallet).not.toHaveBeenCalled()
  })

  it('times out waiting for the credit but keeps the record so it can resume', async () => {
    vi.mocked(getWirexWallet).mockResolvedValue(wirexWallet(10))
    const final = await trackWirexTopUp({ ...pending, phase: 'crediting' }, { ...fast, creditTimeoutMs: 5 })
    expect(final.phase).toBe('timeout')
    expect(readPendingTopUps('0xUser')).toHaveLength(1)
  })

  it('keeps polling through transient errors', async () => {
    vi.mocked(bridge.getWrapQuote)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(makeQuote({ status: 'completed' }))
    vi.mocked(getWirexWallet).mockRejectedValueOnce(new Error('network')).mockResolvedValue(wirexWallet(20))
    const final = await trackWirexTopUp(pending, fast)
    expect(final.phase).toBe('credited')
  })
})
