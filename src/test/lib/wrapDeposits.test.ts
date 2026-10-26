import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WrapQuote } from '../../lib/arkadeWrap'

const getWrapQuote = vi.fn()

vi.mock('../../lib/arkadeWrap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/arkadeWrap')>()),
  getWrapQuote: (id: string) => getWrapQuote(id),
}))

vi.mock('../../lib/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/assets')>()),
  getWrappedAssetId: (symbol: string) => (symbol === 'USDT' ? 'usdt-asset-id' : undefined),
}))

const {
  buildWrapTx,
  getWrapDeposit,
  getWrapDeposits,
  getWrapDepositTxs,
  refreshWrapDeposits,
  saveWrapDeposit,
  subscribeWrapDeposits,
} = await import('../../lib/wrapDeposits')
const { getTxStatus } = await import('../../lib/txStatus')

const NOW = 1_800_000_000_000
const DAY = 24 * 60 * 60 * 1000

const quote = (overrides: Partial<WrapQuote> = {}): WrapQuote => ({
  id: 'q1',
  type: 'wrap',
  chain: 'ethereum',
  ticker: 'USDT',
  sender: '0xsender',
  receiver: 'ark1receiver',
  treasury: '0xtreasury',
  status: 'pending',
  amount: null,
  fee_amount: null,
  payout_amount: null,
  deposit_tx_hash: null,
  mint_tx_hash: null,
  burn_tx_hash: null,
  payout_tx_hash: null,
  expiry: NOW + 60_000,
  ...overrides,
})

const deposit = (overrides: Partial<WrapQuote> = {}, createdAt = NOW) => ({
  assetSymbol: 'USDT',
  createdAt,
  quote: quote(overrides),
})

describe('wrap deposits', () => {
  beforeEach(() => getWrapQuote.mockReset())
  afterEach(() => localStorage.clear())

  it('lists nothing until the bridge has seen a deposit', () => {
    saveWrapDeposit(deposit())
    expect(getWrapDepositTxs(getWrapDeposits())).toEqual([])
  })

  it('lists a seen deposit as a pending received asset tx', () => {
    saveWrapDeposit(deposit({ status: 'deposited', amount: '5000000', payout_amount: '4990000' }))
    const [tx] = getWrapDepositTxs(getWrapDeposits())
    expect(tx.type).toBe('received')
    expect(tx.createdAt).toBe(NOW / 1000)
    expect(tx.assets).toEqual([{ assetId: 'usdt-asset-id', amount: BigInt(4_990_000) }])
    expect(tx.wrap).toEqual({ chain: 'ethereum', quoteId: 'q1', status: 'deposited' })
    expect(getTxStatus(tx, 0)).toBe('Wrapping')
  })

  it('drops the row on completion, since the minted asset is then a real tx', () => {
    saveWrapDeposit(deposit({ status: 'completed', amount: '5000000' }))
    expect(getWrapDepositTxs(getWrapDeposits())).toEqual([])
    // ...but a detail screen opened while pending can still follow it
    expect(getTxStatus(buildWrapTx(getWrapDeposit('q1')!)!, 0)).toBe('Settled')
  })

  it('shows a deposit the bridge failed to wrap as failed', () => {
    saveWrapDeposit(deposit({ status: 'failed', deposit_tx_hash: '0xdep' }))
    const [tx] = getWrapDepositTxs(getWrapDeposits())
    expect(getTxStatus(tx, 0)).toBe('Wrap failed')
  })

  it('polls in-flight quotes, stores the update and notifies subscribers', async () => {
    saveWrapDeposit(deposit())
    saveWrapDeposit(deposit({ id: 'done', status: 'completed' }))
    getWrapQuote.mockResolvedValue(quote({ status: 'processing', amount: '100' }))
    const listener = vi.fn()
    const unsubscribe = subscribeWrapDeposits(listener)

    await refreshWrapDeposits(NOW)

    expect(getWrapQuote).toHaveBeenCalledTimes(1)
    expect(getWrapQuote).toHaveBeenCalledWith('q1')
    expect(getWrapDeposit('q1')?.quote.status).toBe('processing')
    expect(listener).toHaveBeenCalled()
    unsubscribe()
  })

  it('keeps a stored quote when polling fails', async () => {
    saveWrapDeposit(deposit({ status: 'deposited', amount: '100' }))
    getWrapQuote.mockRejectedValue(new Error('offline'))
    await refreshWrapDeposits(NOW)
    expect(getWrapDeposit('q1')?.quote.status).toBe('deposited')
  })

  it('forgets deposits past retention', async () => {
    saveWrapDeposit(deposit({ status: 'failed', amount: '100' }, NOW - 8 * DAY))
    saveWrapDeposit(deposit({ id: 'recent', status: 'failed', amount: '100' }, NOW - DAY))
    await refreshWrapDeposits(NOW)
    expect(getWrapDeposits().map((d) => d.quote.id)).toEqual(['recent'])
  })
})
