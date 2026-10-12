/**
 * POS app settings and payment records.
 *
 * The POS app is a thin layer over the wallet's existing rails:
 * - BTC payout: a plain receive (Arkade / Lightning) into this wallet.
 * - Fiat payout: the same receive, followed by a bank withdrawal (off-ramp)
 *   of the received amount via providers/bankTransfer — see posConversion.ts.
 *
 * Both are stored locally, like bank order history. Bank details are kept out
 * of the app Config on purpose: Config is backed up to Nostr.
 *
 * The fiat value of every payment is fixed when the sale is created and never
 * recomputed from live prices (unlike portfolio value), so the payment list
 * and exports show what the merchant actually charged.
 */

import type { BankCircuit, BankData } from './bankTransferConfig'
import { TRANSFER_METHOD } from './transferMethods'
import { fiatDecimalsFor } from './fiat'
import { getStorageItem } from './storage'
import type { Fiats } from './types'

export type PosFiatPayoutCurrency = 'EUR' | 'CHF'
export type PosPayoutCurrency = 'BTC' | PosFiatPayoutCurrency

export type PosMethod = typeof TRANSFER_METHOD.ark | typeof TRANSFER_METHOD.lightning
export const POS_METHODS: PosMethod[] = [TRANSFER_METHOD.ark, TRANSFER_METHOD.lightning]

export interface PosSettings {
  /** Set once the onboarding (welcome + payout setup) has been completed. */
  onboarded: boolean
  payoutCurrency: PosPayoutCurrency
  /** Bank rail and account for fiat payouts. Required when payoutCurrency is fiat. */
  circuit?: BankCircuit
  bankData?: BankData
  /** Last used payment method and keypad unit, restored on next open. */
  method: PosMethod
  inputUnit?: string
}

export const defaultPosSettings: PosSettings = {
  onboarded: false,
  payoutCurrency: 'BTC',
  method: TRANSFER_METHOD.ark,
}

export const isFiatPayout = (currency: PosPayoutCurrency): currency is PosFiatPayoutCurrency => currency !== 'BTC'

/** Fiat payouts are only usable once a bank account has been saved for them. */
export const isPayoutConfigured = (settings: PosSettings): boolean =>
  !isFiatPayout(settings.payoutCurrency) || Boolean(settings.bankData && settings.circuit)

/**
 * A sale is pending until paid. It stays open to late payments until
 * `openUntil` (see POS_SALE_WINDOW_MS); one that expires unpaid is deleted.
 */
export type PosPaymentStatus = 'pending' | 'completed'

export type PosConversionStatus = 'converting' | 'submitted' | 'failed'

export interface PosConversion {
  status: PosConversionStatus
  currency: PosFiatPayoutCurrency
  orderId?: string
  error?: string
  updatedAt: number
}

export interface PosPayment {
  id: string
  createdAt: number
  completedAt?: number
  note: string
  method: PosMethod
  /** Amount requested from the customer, in sats. */
  sats: number
  /**
   * Amount the wallet should receive, when it differs from `sats` — a
   * Lightning sale arrives net of the swap's fee.
   */
  expectedSats?: number
  /** Amount that actually arrived (so far, while pending), in sats. */
  receivedSats?: number
  /** Until when (ms) an incoming payment can still settle this sale. */
  openUntil: number
  /** Fiat value at the time of the sale — fixed, never recomputed. */
  fiatAmount: number
  fiatCurrency: string
  payoutCurrency: PosPayoutCurrency
  status: PosPaymentStatus
  /** Off-ramp to the merchant's bank account (fiat payouts only). */
  conversion?: PosConversion
}

const SETTINGS_KEY = 'pos_settings'
const PAYMENTS_KEY = 'pos_payments'

// ─── Settings ───────────────────────────────────────────────────────────────

export const getPosSettings = (): PosSettings =>
  getStorageItem(SETTINGS_KEY, { ...defaultPosSettings }, (raw) => ({ ...defaultPosSettings, ...JSON.parse(raw) }))

export const savePosSettings = (settings: PosSettings): PosSettings => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  return settings
}

export const updatePosSettings = (patch: Partial<PosSettings>): PosSettings =>
  savePosSettings({ ...getPosSettings(), ...patch })

/** Switch to BTC payout. Bank details are kept so switching back is quick. */
export const setBtcPayout = (): PosSettings => updatePosSettings({ payoutCurrency: 'BTC', onboarded: true })

/** Switch to a fiat payout. Requires the bank account the payouts go to. */
export const setFiatPayout = (currency: PosFiatPayoutCurrency, circuit: BankCircuit, bankData: BankData): PosSettings =>
  updatePosSettings({ payoutCurrency: currency, circuit, bankData, onboarded: true })

// ─── Keypad units ───────────────────────────────────────────────────────────

/**
 * Units the amount can be typed in ('SATS', 'BTC' or a fiat symbol), first one
 * being the default: the payout fiat (when converting), the display fiat, then
 * BTC and sats.
 */
export const posInputUnits = (payoutCurrency: PosPayoutCurrency, displayFiat: string): string[] => [
  ...new Set([isFiatPayout(payoutCurrency) ? payoutCurrency : displayFiat, displayFiat, 'BTC', 'SATS']),
]

export const isFiatUnit = (unit: string): boolean => unit !== 'BTC' && unit !== 'SATS'

export const posUnitDecimals = (unit: string): number => {
  if (unit === 'SATS') return 0
  if (unit === 'BTC') return 8
  return fiatDecimalsFor(unit as Fiats)
}

// ─── Payments ───────────────────────────────────────────────────────────────
//
// Stored newest-first. Reads go through a cache keyed on the raw stored string,
// so the list is only parsed when it actually changed (here, in another tab or
// by a reset), and unchanged records keep their object identity between reads
// — which is what lets screens subscribe with useSyncExternalStore.

type Listener = () => void
const listeners = new Set<Listener>()

/** Subscribe to payment record changes (e.g. a conversion finishing in the background). */
export const subscribePosPayments = (listener: Listener): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const parsePayments = (raw: string | null): PosPayment[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

let cache: { raw: string | null; payments: PosPayment[] } = { raw: null, payments: [] }

export const getPosPayments = (): PosPayment[] => {
  const raw = localStorage.getItem(PAYMENTS_KEY)
  if (raw !== cache.raw) cache = { raw, payments: parsePayments(raw) }
  return cache.payments
}

export const getPosPayment = (id: string): PosPayment | undefined => getPosPayments().find((p) => p.id === id)

const writePayments = (payments: PosPayment[]) => {
  const raw = JSON.stringify(payments)
  localStorage.setItem(PAYMENTS_KEY, raw)
  cache = { raw, payments }
  listeners.forEach((l) => l())
}

export const updatePosPayment = (id: string, patch: Partial<PosPayment>): PosPayment | undefined => {
  const payments = getPosPayments()
  const index = payments.findIndex((p) => p.id === id)
  if (index === -1) return
  const updated = { ...payments[index], ...patch }
  writePayments(payments.map((p, i) => (i === index ? updated : p)))
  return updated
}

/** Remove a sale that was never paid (its QR was closed). */
export const deletePosPayment = (id: string): void => {
  const payments = getPosPayments()
  if (payments.some((p) => p.id === id)) writePayments(payments.filter((p) => p.id !== id))
}

const randomId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export type NewPosPayment = Omit<PosPayment, 'id' | 'createdAt' | 'status' | 'openUntil'>

/**
 * How long a sale stays open to a late payment after its QR was last on
 * screen — e.g. the merchant closed the QR before the customer's payment
 * landed. A Lightning sale also stays open this long past its invoice expiry,
 * since a paid hold invoice settles into the wallet after the fact.
 */
export const POS_SALE_WINDOW_MS = 30 * 60_000

export const createPosPayment = (input: NewPosPayment, now = Date.now()): PosPayment => {
  const payment: PosPayment = { ...input, id: randomId(), createdAt: now, status: 'pending', openUntil: now + POS_SALE_WINDOW_MS }
  writePayments([payment, ...getPosPayments()])
  return payment
}

/**
 * How far below the requested amount a payment may fall and still settle the
 * sale. Chimera locks a scanned QR's amount, but other wallets may let the
 * customer re-price it (e.g. typing "1 EUR" at their own rate), and wallets
 * round differently. The amount actually received is what's recorded.
 */
const UNDERPAYMENT_TOLERANCE = 0.02

/** Whether `receivedSats` settles a sale expecting `expectedSats`. */
export const isPosPaymentCovered = (receivedSats: number, expectedSats: number): boolean =>
  receivedSats > 0 && receivedSats >= Math.floor(expectedSats * (1 - UNDERPAYMENT_TOLERANCE))

const expectedOf = (p: PosPayment) => p.expectedSats ?? p.sats

const isOpenSale = (p: PosPayment, now: number) => p.status === 'pending' && now <= p.openUntil

/** Keep a sale open to late payments for another window from now. */
export const keepPosSaleOpen = (id: string, now = Date.now()): void => {
  const sale = getPosPayment(id)
  if (sale && sale.status === 'pending' && sale.openUntil < now + POS_SALE_WINDOW_MS) {
    updatePosPayment(id, { openUntil: now + POS_SALE_WINDOW_MS })
  }
}

/**
 * Attribute `incomingSats` that just arrived in the wallet to an open sale.
 *
 * It settles the open sale it covers (with whatever that sale already
 * received), preferring the closest amount and then the newest sale. Funds that
 * cover no sale count as a partial payment towards the newest open one, so a
 * customer can top up. Returns the sale this settled, if any.
 */
export const settlePosIncoming = (incomingSats: number, now = Date.now()): PosPayment | undefined => {
  if (incomingSats <= 0) return
  const open = getPosPayments().filter((p) => isOpenSale(p, now)) // newest first
  if (!open.length) return

  const totalFor = (p: PosPayment) => (p.receivedSats ?? 0) + incomingSats
  const covered = open
    .filter((p) => isPosPaymentCovered(totalFor(p), expectedOf(p)))
    .sort((a, b) => Math.abs(totalFor(a) - expectedOf(a)) - Math.abs(totalFor(b) - expectedOf(b)))
  const target = covered[0]
  if (target) return updatePosPayment(target.id, { status: 'completed', receivedSats: totalFor(target), completedAt: now })

  updatePosPayment(open[0].id, { receivedSats: totalFor(open[0]) })
}

/**
 * Close sales whose window has passed. Unpaid ones are deleted; one that was
 * partly paid is kept as a completed sale for what arrived, its fiat value
 * scaled at the sale's own fixed rate, so the money stays in the history.
 */
export const expirePosSales = (now = Date.now()): PosPayment[] => {
  const expired = getPosPayments().filter((p) => p.status === 'pending' && now > p.openUntil)
  const kept: PosPayment[] = []
  for (const p of expired) {
    if (!p.receivedSats) {
      deletePosPayment(p.id)
      continue
    }
    const decimals = posUnitDecimals(p.fiatCurrency)
    const fiatAmount = Math.round(((p.fiatAmount * p.receivedSats) / expectedOf(p)) * 10 ** decimals) / 10 ** decimals
    const updated = updatePosPayment(p.id, { status: 'completed', fiatAmount, completedAt: now })
    if (updated) kept.push(updated)
  }
  return kept
}

/** Paid sales created within [start, end], most recent first. */
export const filterPosPaymentsByDateRange = (payments: PosPayment[], start: Date, end: Date): PosPayment[] => {
  const from = start.getTime()
  const to = end.getTime()
  return payments.filter((p) => p.status === 'completed' && p.createdAt >= from && p.createdAt <= to)
}

/** Sum of paid sales' fixed fiat values, per currency. */
export const totalPosFiatByCurrency = (payments: PosPayment[]): Record<string, number> =>
  payments
    .filter((p) => p.status === 'completed')
    .reduce<Record<string, number>>((acc, p) => {
      acc[p.fiatCurrency] = (acc[p.fiatCurrency] ?? 0) + p.fiatAmount
      return acc
    }, {})

export type PosOutcome = 'pending' | 'completed' | 'failed'

/**
 * Overall outcome of a sale. A fiat sale is only a success once its payout has
 * been handed to the bank rail — a received payment whose conversion failed is
 * reported as failed (the BTC stays in the wallet).
 */
export const posPaymentOutcome = (payment: PosPayment): PosOutcome => {
  if (payment.status === 'pending') return 'pending'
  if (!isFiatPayout(payment.payoutCurrency)) return 'completed'
  switch (payment.conversion?.status) {
    case 'submitted':
      return 'completed'
    case 'failed':
      return 'failed'
    default:
      return 'pending'
  }
}
