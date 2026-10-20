import type { Asset, Coin, ExtendedVirtualCoin } from '@arkade-os/sdk'
import { consoleError } from './logs'

export interface IncomingPayment {
  /** Total sats in the new coins. */
  sats: number
  /**
   * Total sats in the wallet's own coins spent by the same update. A batch
   * renewal or an outgoing payment spends coins and creates new ones, so
   * `sats - spentSats` is what actually arrived from outside.
   */
  spentSats: number
  /** Arkade assets carried by the new VTXOs, merged per assetId. */
  assets: Asset[]
}

/**
 * Read a wallet service-worker message and return what arrived, or null when
 * the message isn't a payment (or carries nothing).
 *
 * v0.4 of the SDK wraps broadcast data under `payload`; the flat shape is still
 * accepted in case an older worker build is active.
 */
export const parseIncomingPayment = (data: unknown): IncomingPayment | null => {
  if (!data || typeof data !== 'object') return null
  const message = data as { type?: string; payload?: Record<string, unknown> }
  const payload = (message.payload ?? message) as Record<string, unknown>

  let sats = 0
  let spentSats = 0
  const assets: Asset[] = []

  if (message.type === 'VTXO_UPDATE') {
    const newVtxos = payload?.newVtxos
    if (!Array.isArray(newVtxos)) {
      consoleError(message.payload, 'VTXO_UPDATE message has unexpected payload shape')
      return null
    }
    for (const v of newVtxos as ExtendedVirtualCoin[]) {
      sats += v.value
      for (const a of v.assets ?? []) {
        const existing = assets.find((x) => x.assetId === a.assetId)
        if (existing) existing.amount += a.amount
        else assets.push({ ...a })
      }
    }
    const spentVtxos = payload?.spentVtxos
    if (Array.isArray(spentVtxos)) {
      spentSats = (spentVtxos as ExtendedVirtualCoin[]).reduce((acc, v) => acc + v.value, 0)
    }
  } else if (message.type === 'UTXO_UPDATE') {
    const coins = payload?.coins
    if (!Array.isArray(coins)) {
      consoleError(message.payload, 'UTXO_UPDATE message has unexpected payload shape')
      return null
    }
    sats = (coins as Coin[]).reduce((acc, c) => acc + c.value, 0)
  } else {
    return null
  }

  return sats || assets.length > 0 ? { sats, spentSats, assets } : null
}
