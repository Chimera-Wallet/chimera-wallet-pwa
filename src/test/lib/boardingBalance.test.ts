import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExtendedVirtualCoin } from '@arkade-os/sdk'
import { boardingAwareTotal, resetIndexedCommitments } from '../../lib/boardingBalance'

const EXPLORER = 'https://explorer.test/api'
const NOW = 1_800_000_000_000

const vtxo = (overrides: Partial<ExtendedVirtualCoin> = {}): ExtendedVirtualCoin =>
  ({
    txid: 'vtxo',
    vout: 0,
    value: 100,
    isPreconfirmed: false,
    commitmentTxIds: ['commitment'],
    createdAt: new Date(NOW - 5_000),
    ...overrides,
  }) as ExtendedVirtualCoin

// 50 already in the wallet, then a 100 deposit boards: the explorer still
// lists the boarding UTXO, so the SDK reports 250.
const doubleCounted = { total: 250, boarding: { confirmed: 100 } }

const explorerResponds = (status: number) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status }))

describe('boardingAwareTotal', () => {
  beforeEach(() => resetIndexedCommitments())
  afterEach(() => vi.restoreAllMocks())

  it('leaves the boarded deposit out while the explorer lags its batch', async () => {
    const fetchSpy = explorerResponds(404)
    expect(await boardingAwareTotal(doubleCounted, [vtxo()], EXPLORER, NOW)).toEqual({ total: 150, lagging: true })
    expect(fetchSpy).toHaveBeenCalledWith(`${EXPLORER}/tx/commitment/status`, expect.anything())
  })

  it("uses the SDK's total once the explorer has the batch, and stops asking about it", async () => {
    const fetchSpy = explorerResponds(200)
    const settled = { total: 150, boarding: { confirmed: 0 } }
    expect(await boardingAwareTotal({ total: 150, boarding: { confirmed: 100 } }, [vtxo()], EXPLORER, NOW)).toEqual({
      total: 150,
      lagging: false,
    })
    await boardingAwareTotal({ total: 150, boarding: { confirmed: 100 } }, [vtxo()], EXPLORER, NOW)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(await boardingAwareTotal(settled, [vtxo()], EXPLORER, NOW)).toEqual({ total: 150, lagging: false })
  })

  it('counts a pending deposit while it waits to board', async () => {
    const fetchSpy = explorerResponds(404)
    // unconfirmed: can't have boarded yet
    const pending = { total: 150, boarding: { confirmed: 0 } }
    expect(await boardingAwareTotal(pending, [vtxo()], EXPLORER, NOW)).toEqual({ total: 150, lagging: false })
    // confirmed, but no recent batch output to have absorbed it
    const old = vtxo({ createdAt: new Date(NOW - 60 * 60 * 1000) })
    expect(await boardingAwareTotal(doubleCounted, [old], EXPLORER, NOW)).toEqual({ total: 250, lagging: false })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('ignores preconfirmed VTXOs, which never come from boarding', async () => {
    explorerResponds(404)
    const offchain = vtxo({ isPreconfirmed: true })
    expect(await boardingAwareTotal(doubleCounted, [offchain], EXPLORER, NOW)).toEqual({ total: 250, lagging: false })
  })

  it("keeps the SDK's total when the explorer can't be asked", async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    expect(await boardingAwareTotal(doubleCounted, [vtxo()], EXPLORER, NOW)).toEqual({ total: 250, lagging: false })
    explorerResponds(500)
    expect(await boardingAwareTotal(doubleCounted, [vtxo()], EXPLORER, NOW)).toEqual({ total: 250, lagging: false })
    expect(await boardingAwareTotal(doubleCounted, [vtxo()], undefined, NOW)).toEqual({ total: 250, lagging: false })
  })
})
