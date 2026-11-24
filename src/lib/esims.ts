import type { IWallet } from '@arkade-os/sdk'
import {
  getEsimOrder,
  listEsimOrders,
  purchaseEsim,
  reportRampDeposit,
  type EsimAsset,
  type EsimOrderView,
  type RampOrderStatus,
} from '../providers/ramp'
import { decodeArkAddress } from './address'
import { sendAssets, sendOffChain } from './asp'
import { getWrappedAssetId } from './assets'
import { signEsimProof } from './esimKey'
import { consoleError } from './logs'
import type { Tx } from './types'

/**
 * eSIMs bought from ramp-system (see its CLAUDE.md, "eSIMs are sold for crypto
 * from uploaded stock").
 *
 * The flow is built so a paid eSIM can't be lost:
 * 1. Create the order. It's saved here, with its access key, before anything
 *    is paid.
 * 2. Pay exactly its amount to ramp's deposit address. The order is marked as
 *    being paid first, so it's never paid twice, and the txid is saved as soon
 *    as the payment exists.
 * 3. Report the txid. Ramp credits a payment made before the order expired,
 *    whenever it's reported, so a failed report just waits for the next sync.
 * 4. Read the order until the link is there, and keep it.
 *
 * If the phone is lost, everything comes back without this storage: ramp
 * binds each order to the wallet's eSIM key (lib/esimKey.ts), so a restored
 * wallet lists its orders and links again (syncEsims), and finds any payment
 * it made but never reported in its own transaction history. The list is also
 * in the Nostr backup.
 */

export const ESIM_STORAGE_KEY = 'esim_orders'

export interface StoredEsim {
  token: string
  code: string // what the user quotes to support
  accessKey: string | null // null for an order recovered from ramp's listing
  asset: EsimAsset
  cryptoAmount: string
  depositAddress: string | null
  status: RampOrderStatus
  plan: string | null
  link: string | null
  linkUnavailable: boolean
  paying: boolean // a payment was started; never start another for this order
  txid: string | null
  reported: boolean // ramp accepted the txid
  // Ramp refused the payment as late: the user needs a refund from support
  paidTooLate: boolean
  createdAt: number // ms
  expiresAt: number | null // ms
}

// ─── Storage ────────────────────────────────────────────────────────────────

const listeners = new Set<(esims: StoredEsim[]) => void>()

/** Notified on every local change, so the Nostr backup can follow. */
export const onEsimsChange = (listener: (esims: StoredEsim[]) => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getStoredEsims = (): StoredEsim[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(ESIM_STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isStoredEsim) : []
  } catch {
    return []
  }
}

const saveEsims = (esims: StoredEsim[], notify = true): void => {
  const sorted = [...esims].sort((a, b) => b.createdAt - a.createdAt)
  localStorage.setItem(ESIM_STORAGE_KEY, JSON.stringify(sorted))
  if (notify) listeners.forEach((listener) => listener(sorted))
}

/** Writes one order, merged with what's already stored for it. */
const upsertEsim = (esim: StoredEsim): StoredEsim => {
  const all = getStoredEsims()
  const existing = all.find((e) => e.token === esim.token)
  const merged = existing ? mergeEsim(existing, esim) : esim
  saveEsims([...all.filter((e) => e.token !== esim.token), merged])
  return merged
}

const STATUS_RANK: Record<RampOrderStatus, number> = {
  WAITING_FOR_DEPOSIT: 0,
  DEPOSIT_RECEIVED: 1,
  PROCESSING: 2,
  PENDING_MANUAL: 3,
  FAILED: 4,
  REJECTED: 4,
  EXPIRED: 4,
  REFUNDED: 5,
  COMPLETED: 6,
}

/**
 * Two copies of one order (this device, the Nostr backup, ramp) combined
 * without losing anything either knows: the furthest status, and any key,
 * txid or link either has. Never loses a link or a txid.
 */
export const mergeEsim = (a: StoredEsim, b: StoredEsim): StoredEsim => {
  const ahead = STATUS_RANK[b.status] > STATUS_RANK[a.status] ? b : a
  return {
    ...a,
    ...b,
    status: ahead.status,
    accessKey: a.accessKey ?? b.accessKey,
    plan: b.plan ?? a.plan,
    link: b.link ?? a.link,
    linkUnavailable: (b.link ?? a.link) ? false : b.linkUnavailable || a.linkUnavailable,
    paying: a.paying || b.paying,
    txid: a.txid ?? b.txid,
    reported: a.reported || b.reported,
    paidTooLate: (a.paidTooLate || b.paidTooLate) && ahead.status !== 'COMPLETED',
    depositAddress: a.depositAddress ?? b.depositAddress,
  }
}

/** Merges orders from the Nostr backup in. Doesn't trigger another backup. */
export const restoreEsims = (backedUp: unknown[]): number => {
  const local = new Map(getStoredEsims().map((e) => [e.token, e]))
  let added = 0
  for (const entry of backedUp) {
    if (!isStoredEsim(entry)) continue
    const existing = local.get(entry.token)
    if (!existing) added++
    local.set(entry.token, existing ? mergeEsim(existing, entry) : entry)
  }
  saveEsims([...local.values()], false)
  return added
}

export const isStoredEsim = (value: unknown): value is StoredEsim => {
  const v = value as Partial<StoredEsim> | null
  return (
    !!v &&
    typeof v.token === 'string' &&
    typeof v.code === 'string' &&
    (v.asset === 'ARK-BTC' || v.asset === 'USDT-CX') &&
    typeof v.cryptoAmount === 'string' &&
    typeof v.status === 'string' &&
    v.status in STATUS_RANK &&
    typeof v.createdAt === 'number' &&
    (v.link === null || typeof v.link === 'string') &&
    (v.txid === null || typeof v.txid === 'string')
  )
}

// ─── Amounts and assets ─────────────────────────────────────────────────────

const DECIMALS: Record<EsimAsset, number> = { 'ARK-BTC': 8, 'USDT-CX': 6 }

/** "0.00016200" → 16200n, exactly; undefined if it isn't a plain amount. */
export const toBaseUnits = (amount: string, decimals: number): bigint | undefined => {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(amount.trim())
  if (!match) return undefined
  const fraction = match[2] ?? ''
  if (fraction.replace(/0+$/, '').length > decimals) return undefined
  return (
    BigInt(match[1]) * BigInt(10) ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0').slice(0, decimals) || '0')
  )
}

export const esimAmountUnits = (esim: Pick<StoredEsim, 'asset' | 'cryptoAmount'>): bigint => {
  const units = toBaseUnits(esim.cryptoAmount, DECIMALS[esim.asset])
  if (units === undefined || units <= BigInt(0)) throw new Error('This eSIM order has an invalid amount')
  return units
}

/** The Arkade asset id USDT-CX is paid with, or undefined for BTC. */
const assetIdOf = (asset: EsimAsset): string | undefined => {
  if (asset === 'ARK-BTC') return undefined
  const id = getWrappedAssetId('USDT')
  if (!id) throw new Error('USDT is not available in this wallet')
  return id
}

// ─── Links ──────────────────────────────────────────────────────────────────

/**
 * Opens an eSIM's instructions page in the browser. The provider's pages
 * refuse to be shown inside another site, so never in an iframe. Only web
 * links are opened: a stored link is data from a server and a backup, not
 * something to hand to the browser unchecked.
 */
export const openEsimLink = (link: string): boolean => {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && import.meta.env.MODE !== 'production')) return false
  window.open(url.toString(), '_blank', 'noopener,noreferrer')
  return true
}

// ─── Flow ───────────────────────────────────────────────────────────────────

const fromView = (view: EsimOrderView, accessKey: string | null): StoredEsim => ({
  token: view.order.id,
  code: view.order.code,
  accessKey,
  asset: view.order.asset,
  cryptoAmount: view.order.crypto_amount,
  depositAddress: view.order.deposit_crypto_address,
  status: view.order.status,
  plan: view.plan,
  link: view.link,
  linkUnavailable: Boolean(view.link_unavailable),
  paying: false,
  txid: view.order.deposit_txid,
  reported: Boolean(view.order.deposit_txid),
  paidTooLate: false,
  createdAt: Date.parse(view.order.created_at),
  expiresAt: view.order.expires_at ? Date.parse(view.order.expires_at) : null,
})

/**
 * Creates an order and saves it before anything is paid. Refuses an order
 * whose deposit address belongs to another Ark server, or whose amount is
 * worth clearly more than the price (`maxFiatValue`, when the wallet can
 * value it), so a wrong or compromised server can't overcharge.
 */
export const createEsimOrder = async ({
  asset,
  email,
  signerPubkey,
  valueInEur,
  price,
}: {
  asset: EsimAsset
  email: string
  signerPubkey: string
  /** EUR value of an amount of `asset` in base units, or 0 if unknown. */
  valueInEur: (asset: EsimAsset, units: bigint) => number
  price: number
}): Promise<StoredEsim> => {
  const view = await purchaseEsim({ asset, email, ...signEsimProof('esim-purchase') })
  const esim = upsertEsim(fromView(view, view.access_key))

  if (esim.asset !== asset) throw new Error('The order came back for a different asset')
  if (!esim.depositAddress) throw new Error('The order has no payment address')
  const { serverPubKey } = decodeArkAddress(esim.depositAddress)
  if (serverPubKey !== signerPubkey.slice(-64).toLowerCase()) {
    throw new Error('The payment address belongs to a different Ark server')
  }
  const value = valueInEur(asset, esimAmountUnits(esim))
  if (value > price * 1.1) throw new Error('The amount asked is more than the eSIM is worth. Please contact support.')
  return esim
}

/**
 * Pays an order once. Throws if it was already started (check the payment
 * status instead) or has expired.
 */
export const payEsimOrder = async (svcWallet: IWallet, token: string): Promise<StoredEsim> => {
  const esim = getStoredEsims().find((e) => e.token === token)
  if (!esim) throw new Error('eSIM order not found')
  if (esim.paying || esim.txid) throw new Error('This order is already being paid')
  if (esim.expiresAt && esim.expiresAt <= Date.now()) throw new Error('This order has expired. Please start a new one.')
  if (!esim.depositAddress) throw new Error('The order has no payment address')

  const units = esimAmountUnits(esim)
  const assetId = assetIdOf(esim.asset)
  upsertEsim({ ...esim, paying: true })

  const txid = assetId
    ? await sendAssets(svcWallet, esim.depositAddress, [{ assetId, amount: units }])
    : await sendOffChain(svcWallet, Number(units), esim.depositAddress)
  if (!txid) throw new Error('The payment failed')

  const paid = upsertEsim({ ...esim, paying: true, txid })
  return reportEsimPayment(paid)
}

/** Tells ramp which transaction paid the order. Safe to repeat. */
const reportEsimPayment = async (esim: StoredEsim): Promise<StoredEsim> => {
  if (!esim.txid || esim.reported) return esim
  try {
    const order = await reportRampDeposit(esim.token, esim.txid)
    return upsertEsim({ ...esim, reported: true, status: order.status as RampOrderStatus })
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    // Paid after the deadline: ramp keeps the money aside for a refund
    if (/expired/i.test(message)) return upsertEsim({ ...esim, paidTooLate: true })
    throw err
  }
}

/** Reads the order's latest status and, once delivered, its link. */
const refreshEsim = async (esim: StoredEsim): Promise<StoredEsim> => {
  if (!esim.accessKey) return esim
  const view = await getEsimOrder(esim.token, esim.accessKey)
  return upsertEsim(fromView(view, esim.accessKey))
}

const settled = (esim: StoredEsim) => esim.link !== null || ['REFUNDED', 'REJECTED', 'FAILED'].includes(esim.status)

/** Whether a background sync has anything to do for this order. */
export const esimNeedsSync = (esim: StoredEsim): boolean => {
  if (settled(esim) || esim.paidTooLate) return false
  if (esim.txid && !esim.reported) return true // a report to send
  return esim.reported // paid and reported, link still to come
}

/**
 * Brings every order up to date: reports payments ramp hasn't been told
 * about and reads orders still on their way. With `listFromServer` it also
 * asks ramp for every order bound to this wallet's key (needs the unlocked
 * wallet) and reports payments found in `txs` that this device never
 * recorded, the case of a phone lost right after paying.
 */
export const syncEsims = async ({ txs, listFromServer }: { txs?: Tx[]; listFromServer: boolean }): Promise<void> => {
  if (listFromServer) {
    const { orders } = await listEsimOrders(signEsimProof('esim-orders'))
    const local = new Map(getStoredEsims().map((e) => [e.token, e]))
    for (const view of orders) {
      const known = local.get(view.order.id)
      upsertEsim(fromView(view, known?.accessKey ?? null))
    }
  }

  for (const esim of getStoredEsims()) {
    try {
      let current = esim
      if (!current.txid && !current.reported && txs) current = matchUnrecordedPayment(current, txs)
      if (current.txid && !current.reported) current = await reportEsimPayment(current)
      if (!settled(current) && current.reported) await refreshEsim(current)
    } catch (err) {
      consoleError(err, `eSIM order ${esim.code}: sync failed`)
    }
  }
}

/**
 * A sent transaction in the wallet's history that pays exactly this order's
 * amount while it was open: the payment of an order this device has no txid
 * for. Ramp checks any report itself, so a wrong guess is refused, not
 * credited.
 */
const matchUnrecordedPayment = (esim: StoredEsim, txs: Tx[]): StoredEsim => {
  if (esim.status !== 'WAITING_FOR_DEPOSIT') return esim
  const units = esimAmountUnits(esim)
  const assetId = esim.asset === 'USDT-CX' ? getWrappedAssetId('USDT') : undefined
  const from = Math.floor(esim.createdAt / 1000) - 60
  const to = esim.expiresAt ? Math.floor(esim.expiresAt / 1000) + 60 : Infinity
  const match = txs.find(
    (tx) =>
      tx.type === 'sent' &&
      tx.redeemTxid &&
      tx.createdAt >= from &&
      tx.createdAt <= to &&
      (assetId
        ? (tx.assets ?? []).some(
            (a) => a.assetId === assetId && (BigInt(a.amount) === units || -BigInt(a.amount) === units),
          )
        : BigInt(tx.amount) === units),
  )
  return match ? upsertEsim({ ...esim, paying: true, txid: match.redeemTxid }) : esim
}

// ─── What to tell the user ──────────────────────────────────────────────────

export type EsimState =
  | 'ready' // link delivered
  | 'awaitingPayment' // created, not paid, still open
  | 'expired' // never paid, window closed
  | 'confirming' // paid, report or delivery pending
  | 'paying' // a payment was started but its result isn't recorded
  | 'needsSupport' // paid but something needs a person: refund or delivery
  | 'refunded'

export const esimState = (esim: StoredEsim, now = Date.now()): EsimState => {
  if (esim.link) return 'ready'
  if (esim.status === 'REFUNDED') return 'refunded'
  if (esim.paidTooLate || esim.linkUnavailable) return 'needsSupport'
  if (['PENDING_MANUAL', 'FAILED', 'REJECTED'].includes(esim.status))
    return esim.txid || esim.reported ? 'needsSupport' : 'expired'
  if (esim.txid) return 'confirming'
  if (esim.paying) return 'paying'
  if (esim.status === 'COMPLETED' || esim.status === 'DEPOSIT_RECEIVED' || esim.status === 'PROCESSING')
    return 'confirming'
  if (esim.status === 'EXPIRED' || (esim.expiresAt !== null && esim.expiresAt <= now)) return 'expired'
  return 'awaitingPayment'
}
