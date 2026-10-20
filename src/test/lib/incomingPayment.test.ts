import { describe, expect, it } from 'vitest'
import { parseIncomingPayment } from '../../lib/incomingPayment'

describe('parseIncomingPayment', () => {
  it('sums new VTXOs and merges their assets per id', () => {
    const result = parseIncomingPayment({
      type: 'VTXO_UPDATE',
      payload: {
        newVtxos: [
          { value: 1_000, assets: [{ assetId: 'a', amount: BigInt(5) }] },
          { value: 500, assets: [{ assetId: 'a', amount: BigInt(2) }, { assetId: 'b', amount: BigInt(1) }] },
        ],
      },
    })
    expect(result).toEqual({
      sats: 1_500,
      spentSats: 0,
      assets: [
        { assetId: 'a', amount: BigInt(7) },
        { assetId: 'b', amount: BigInt(1) },
      ],
    })
  })

  it('accepts the flat (pre-v0.4 worker) message shape', () => {
    expect(parseIncomingPayment({ type: 'VTXO_UPDATE', newVtxos: [{ value: 42 }] })).toEqual({ sats: 42, spentSats: 0, assets: [] })
  })

  it('reports the wallet coins spent by the same update', () => {
    // e.g. a batch renewal: old coins spent, new ones created
    expect(
      parseIncomingPayment({
        type: 'VTXO_UPDATE',
        payload: { newVtxos: [{ value: 9_900 }], spentVtxos: [{ value: 6_000 }, { value: 4_000 }] },
      }),
    ).toEqual({ sats: 9_900, spentSats: 10_000, assets: [] })
  })

  it('sums boarding UTXOs', () => {
    expect(parseIncomingPayment({ type: 'UTXO_UPDATE', payload: { coins: [{ value: 3 }, { value: 4 }] } })).toEqual({
      sats: 7,
      spentSats: 0,
      assets: [],
    })
  })

  it('ignores other messages, empty updates and malformed payloads', () => {
    expect(parseIncomingPayment(undefined)).toBeNull()
    expect(parseIncomingPayment({ type: 'SOMETHING_ELSE' })).toBeNull()
    expect(parseIncomingPayment({ type: 'VTXO_UPDATE', payload: { newVtxos: [] } })).toBeNull()
    expect(parseIncomingPayment({ type: 'UTXO_UPDATE', payload: { coins: 'nope' } })).toBeNull()
  })
})
