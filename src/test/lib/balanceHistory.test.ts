import { describe, expect, it, vi } from 'vitest'
import type { Tx, TxAssetSwap } from '../../lib/types'

const { USDT_ID, CEXT_ID } = vi.hoisted(() => ({ USDT_ID: 'usdt-asset-id', CEXT_ID: 'cext-asset-id' }))

vi.mock('../../lib/assets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/assets')>()
  const ids: Record<string, string> = { USDT: USDT_ID, CEXT: CEXT_ID }
  return {
    ...actual,
    ASSET_LIST: [actual.ASSETS.BTC, actual.ASSETS.USDT, actual.ASSETS.CEXT, actual.ASSETS.ETH],
    getWrappedAssetId: (symbol: string) => ids[symbol.toUpperCase()],
  }
})

import { BTC_KEY, heldAssets, txDeltas, walletValueHistory } from '../../lib/balanceHistory'

const tx = (type: string, amount: number, createdAtSec: number, extra: Partial<Tx> = {}): Tx => ({
  amount,
  boardingTxid: '',
  createdAt: createdAtSec,
  explorable: undefined,
  preconfirmed: false,
  redeemTxid: '',
  roundTxid: '',
  settled: true,
  type,
  ...extra,
})

const swap = (overrides: Partial<TxAssetSwap>, createdAtSec = 0): Tx =>
  tx('swap', 0, createdAtSec, {
    assetSwap: {
      fromAssetId: BTC_KEY,
      fromTicker: 'BTC',
      fromDecimals: 8,
      fromAmount: BigInt(0),
      toAssetId: USDT_ID,
      toTicker: 'USDT',
      toDecimals: 6,
      toAmount: BigInt(0),
      status: 'completed',
      ...overrides,
    },
  })

describe('txDeltas', () => {
  it('reads sent and received rows as BTC out and in', () => {
    expect(txDeltas(tx('received', 5_000, 1))).toEqual([{ key: BTC_KEY, amount: 5_000 }])
    expect(txDeltas(tx('sent', 2_000, 1))).toEqual([{ key: BTC_KEY, amount: -2_000 }])
  })

  it('takes wrapped asset amounts as already signed by the SDK', () => {
    const send = tx('sent', 330, 1, { assets: [{ assetId: USDT_ID, amount: BigInt(-4_000_000) }] })
    expect(txDeltas(send)).toEqual([
      { key: BTC_KEY, amount: -330 },
      { key: USDT_ID, amount: -4_000_000 },
    ])
  })

  it('reads both legs of a swap, not its member rows', () => {
    expect(txDeltas(swap({ fromAmount: BigInt(10_000), toAmount: BigInt(6_000_000) }))).toEqual([
      { key: BTC_KEY, amount: -10_000 },
      { key: USDT_ID, amount: 6_000_000 },
    ])
  })

  it('ignores what a cancelled swap refunded, and what a pending swap has not delivered', () => {
    expect(txDeltas(swap({ fromAmount: BigInt(10_000), status: 'cancelled' }))).toEqual([])
    expect(txDeltas(swap({ fromAmount: BigInt(10_000), toAmount: BigInt(6_000_000), status: 'pending' }))).toEqual([
      { key: BTC_KEY, amount: -10_000 },
    ])
  })
})

describe('heldAssets', () => {
  it('includes BTC always, plus assets held now or moved before', () => {
    const txs = [tx('received', 330, 1, { assets: [{ assetId: USDT_ID, amount: BigInt(1) }] })]
    expect(heldAssets(0, [], txs).map((a) => a.symbol)).toEqual(['BTC', 'USDT'])
    expect(heldAssets(0, [], []).map((a) => a.symbol)).toEqual(['BTC'])
  })

  it('leaves out assets with no price source', () => {
    expect(heldAssets(0, [{ assetId: CEXT_ID, amount: BigInt(5) }], []).map((a) => a.symbol)).toEqual(['BTC'])
  })
})

describe('walletValueHistory', () => {
  const day = 86_400_000
  const at = (d: number) => (d * day) / 1000

  it('adds every asset, each at what was held then and its price then', () => {
    const btcPrices: [number, number][] = [
      [1 * day, 10_000],
      [2 * day, 20_000],
      [3 * day, 30_000],
    ]
    const usdtPrices: [number, number][] = [
      [1 * day, 1],
      [3 * day, 1],
    ]
    const txs = [
      tx('received', 100_000_000, at(1.5)), // +1 BTC between day 1 and 2
      swap({ fromAmount: BigInt(50_000_000), toAmount: BigInt(15_000_000_000) }, at(2.5)), // 0.5 BTC -> 15k USDT
    ]
    const assets = [
      { symbol: 'BTC', key: BTC_KEY, decimals: 8, current: 50_000_000, prices: btcPrices },
      { symbol: 'USDT', key: USDT_ID, decimals: 6, current: 15_000_000_000, prices: usdtPrices },
    ]
    expect(walletValueHistory(assets, txs)).toEqual([
      [1 * day, 0],
      [2 * day, 20_000], // 1 BTC; USDT not yet bought (priced at day 1's point)
      [3 * day, 30_000], // 0.5 BTC (15k) + 15k USDT
    ])
  })

  it('counts an unconfirmed tx (createdAt 0) as already in the balance', () => {
    const prices: [number, number][] = [
      [1 * day, 10_000],
      [2 * day, 10_000],
    ]
    const assets = [{ symbol: 'BTC', key: BTC_KEY, decimals: 8, current: 100_000_000, prices }]
    expect(walletValueHistory(assets, [tx('received', 100_000_000, 0)]).map(([, v]) => v)).toEqual([0, 0])
  })

  it('never shows a negative holding when history is incomplete', () => {
    const prices: [number, number][] = [
      [1 * day, 10_000],
      [2 * day, 10_000],
    ]
    const assets = [{ symbol: 'BTC', key: BTC_KEY, decimals: 8, current: 0, prices }]
    expect(walletValueHistory(assets, [tx('received', 100_000_000, at(1.5))]).map(([, v]) => v)).toEqual([0, 0])
  })
})
