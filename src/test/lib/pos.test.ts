import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createPosPayment,
  deletePosPayment,
  expirePosSales,
  keepPosSaleOpen,
  POS_SALE_WINDOW_MS,
  settlePosIncoming,
  defaultPosSettings,
  filterPosPaymentsByDateRange,
  getPosPayment,
  getPosPayments,
  getPosSettings,
  isPayoutConfigured,
  isPosPaymentCovered,
  posInputUnits,
  posPaymentOutcome,
  posUnitDecimals,
  setBtcPayout,
  setFiatPayout,
  subscribePosPayments,
  totalPosFiatByCurrency,
  updatePosPayment,
  type PosPayment,
} from '../../lib/pos'
import type { BankData } from '../../lib/bankTransferConfig'

const sepa: BankData = { circuit: 'sepa', destinationBankAddress: 'DE89370400440532013000', accountHolderName: 'Jane Doe' }

const newSale = { note: '', method: 'ark' as const, sats: 1_000, fiatAmount: 1, fiatCurrency: 'EUR', payoutCurrency: 'BTC' as const }

const payment = (overrides: Partial<PosPayment> = {}): PosPayment => ({
  id: 'p1',
  createdAt: Date.UTC(2026, 8, 15),
  note: '',
  method: 'ark',
  sats: 10_000,
  fiatAmount: 10,
  fiatCurrency: 'EUR',
  payoutCurrency: 'BTC',
  status: 'completed',
  openUntil: Date.UTC(2026, 8, 15) + POS_SALE_WINDOW_MS,
  ...overrides,
})

describe('POS settings', () => {
  afterEach(() => localStorage.clear())

  it('defaults to a BTC payout that is not yet onboarded', () => {
    expect(getPosSettings()).toEqual(defaultPosSettings)
    expect(getPosSettings().onboarded).toBe(false)
  })

  it('saves a BTC payout and keeps previously saved bank details', () => {
    setFiatPayout('EUR', 'sepa', sepa)
    const settings = setBtcPayout()
    expect(settings).toMatchObject({ payoutCurrency: 'BTC', onboarded: true, bankData: sepa })
    expect(isPayoutConfigured(settings)).toBe(true)
  })

  it('only treats a fiat payout as configured with a bank account', () => {
    expect(isPayoutConfigured({ ...defaultPosSettings, payoutCurrency: 'CHF' })).toBe(false)
    expect(isPayoutConfigured(setFiatPayout('CHF', 'swift', sepa))).toBe(true)
  })

  it('falls back to defaults when stored settings are corrupt', () => {
    localStorage.setItem('pos_settings', '{not json')
    expect(getPosSettings()).toEqual(defaultPosSettings)
  })
})

describe('POS payments', () => {
  afterEach(() => localStorage.clear())

  it('creates pending payments with the fiat value fixed at creation', () => {
    const created = createPosPayment(
      { note: 'Coffee', method: 'ark', sats: 5_000, fiatAmount: 3.5, fiatCurrency: 'CHF', payoutCurrency: 'CHF' },
      1_000,
    )
    expect(created).toMatchObject({ status: 'pending', createdAt: 1_000, fiatAmount: 3.5, fiatCurrency: 'CHF' })
    expect(getPosPayment(created.id)).toEqual(created)
  })

  it('keeps the newest first, updates in place and notifies subscribers', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePosPayments(listener)
    const old = createPosPayment({ ...newSale, note: 'old' }, 1)
    const recent = createPosPayment({ ...newSale, note: 'new' }, 2)
    updatePosPayment(old.id, { note: 'edited' })
    unsubscribe()
    createPosPayment({ ...newSale, note: 'late' }, 3)

    expect(getPosPayments().map((p) => p.note)).toEqual(['late', 'new', 'edited'])
    expect(getPosPayment(recent.id)?.note).toBe('new')
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('returns the same record object until that record changes', () => {
    const a = createPosPayment(newSale)
    const b = createPosPayment(newSale)
    const before = getPosPayment(a.id)

    updatePosPayment(b.id, { note: 'changed' })
    expect(getPosPayment(a.id)).toBe(before)

    updatePosPayment(a.id, { note: 'changed' })
    expect(getPosPayment(a.id)).not.toBe(before)
  })

  it('picks up changes made outside this module (e.g. another tab)', () => {
    createPosPayment(newSale)
    localStorage.setItem('pos_payments', JSON.stringify([payment({ id: 'elsewhere' })]))
    expect(getPosPayments().map((p) => p.id)).toEqual(['elsewhere'])
  })

  it('deletes a sale that was never paid', () => {
    const sale = createPosPayment(newSale)
    deletePosPayment(sale.id)
    expect(getPosPayment(sale.id)).toBeUndefined()
  })

  it('returns undefined when updating an unknown payment', () => {
    expect(updatePosPayment('missing', { note: 'x' })).toBeUndefined()
  })

  it('filters paid sales by date range', () => {
    const inRange = payment({ id: 'a', createdAt: Date.UTC(2026, 8, 12) })
    const alsoInRange = payment({ id: 'b', createdAt: Date.UTC(2026, 8, 10) })
    const pending = payment({ id: 'c', createdAt: Date.UTC(2026, 8, 11), status: 'pending' })
    const outside = payment({ id: 'e', createdAt: Date.UTC(2026, 7, 1) })

    const result = filterPosPaymentsByDateRange(
      [inRange, pending, alsoInRange, outside],
      new Date(Date.UTC(2026, 8, 1)),
      new Date(Date.UTC(2026, 8, 30)),
    )
    expect(result.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('totals paid sales per currency using the stored fiat values', () => {
    const totals = totalPosFiatByCurrency([
      payment({ fiatAmount: 10, fiatCurrency: 'EUR' }),
      payment({ fiatAmount: 2.5, fiatCurrency: 'EUR' }),
      payment({ fiatAmount: 7, fiatCurrency: 'CHF' }),
      payment({ fiatAmount: 99, fiatCurrency: 'CHF', status: 'pending' }),
    ])
    expect(totals).toEqual({ EUR: 12.5, CHF: 7 })
  })
})

describe('posPaymentOutcome', () => {
  it('completes BTC payouts as soon as the payment arrives', () => {
    expect(posPaymentOutcome(payment())).toBe('completed')
    expect(posPaymentOutcome(payment({ status: 'pending' }))).toBe('pending')
  })

  it('completes fiat payouts only once the bank payout is submitted', () => {
    const fiat = payment({ payoutCurrency: 'EUR' })
    const conversion = { currency: 'EUR' as const, updatedAt: 0 }
    expect(posPaymentOutcome(fiat)).toBe('pending')
    expect(posPaymentOutcome({ ...fiat, conversion: { ...conversion, status: 'converting' } })).toBe('pending')
    expect(posPaymentOutcome({ ...fiat, conversion: { ...conversion, status: 'submitted' } })).toBe('completed')
    expect(posPaymentOutcome({ ...fiat, conversion: { ...conversion, status: 'failed' } })).toBe('failed')
  })
})

describe('keypad units', () => {
  it('offers the payout fiat first when converting, then display fiat, BTC and sats', () => {
    expect(posInputUnits('CHF', 'USD')).toEqual(['CHF', 'USD', 'BTC', 'SATS'])
    expect(posInputUnits('EUR', 'EUR')).toEqual(['EUR', 'BTC', 'SATS'])
    expect(posInputUnits('BTC', 'GBP')).toEqual(['GBP', 'BTC', 'SATS'])
  })

  it('knows each unit precision', () => {
    expect(posUnitDecimals('SATS')).toBe(0)
    expect(posUnitDecimals('BTC')).toBe(8)
    expect(posUnitDecimals('EUR')).toBe(2)
    expect(posUnitDecimals('JPY')).toBe(0)
  })
})

describe('isPosPaymentCovered', () => {
  it('accepts the exact amount, overpayment and small exchange-rate drift', () => {
    expect(isPosPaymentCovered(1_100, 1_100)).toBe(true)
    expect(isPosPaymentCovered(1_200, 1_100)).toBe(true)
    // a payer re-pricing "1 EUR" at a slightly different rate
    expect(isPosPaymentCovered(1_085, 1_100)).toBe(true)
  })

  it('rejects clear underpayment and nothing at all', () => {
    expect(isPosPaymentCovered(1_000, 1_100)).toBe(false)
    expect(isPosPaymentCovered(0, 0)).toBe(false)
  })
})

describe('settling incoming funds against open sales', () => {
  afterEach(() => localStorage.clear())
  const T = 1_000_000

  const open = (sats: number, note: string, createdAt: number) =>
    createPosPayment({ ...newSale, sats, note }, createdAt)

  it('settles the open sale the payment covers', () => {
    const sale = open(1_000, 'coffee', T)
    expect(settlePosIncoming(1_000, T + 1)).toMatchObject({ id: sale.id, status: 'completed', receivedSats: 1_000 })
  })

  it('still settles a sale after its QR was closed, within the window', () => {
    const sale = open(1_000, 'coffee', T)
    expect(settlePosIncoming(990, T + POS_SALE_WINDOW_MS - 1)?.id).toBe(sale.id)
  })

  it('leaves sales whose window has passed alone', () => {
    open(1_000, 'coffee', T)
    expect(settlePosIncoming(1_000, T + POS_SALE_WINDOW_MS + 1)).toBeUndefined()
  })

  it('picks the sale whose amount fits best, then the newest', () => {
    open(5_000, 'big', T)
    const small = open(1_000, 'small', T + 1)
    const twin = open(1_000, 'small twin', T + 2)

    expect(settlePosIncoming(1_000, T + 3)?.id).toBe(twin.id)
    expect(settlePosIncoming(1_000, T + 4)?.id).toBe(small.id)
  })

  it('uses the expected amount for Lightning sales (net of the swap)', () => {
    const sale = createPosPayment({ ...newSale, method: 'lightning', sats: 1_000, expectedSats: 900 }, T)
    expect(settlePosIncoming(900, T + 1)?.id).toBe(sale.id)
  })

  it('counts a short payment towards the newest sale until topped up', () => {
    open(5_000, 'older, not covered by either part', T)
    const sale = open(2_000, 'newest', T + 1)

    expect(settlePosIncoming(1_500, T + 2)).toBeUndefined()
    expect(getPosPayment(sale.id)).toMatchObject({ status: 'pending', receivedSats: 1_500 })

    expect(settlePosIncoming(500, T + 3)).toMatchObject({ id: sale.id, status: 'completed', receivedSats: 2_000 })
  })

  it('ignores nothing-incoming updates and wallets with no open sale', () => {
    open(1_000, 'coffee', T)
    expect(settlePosIncoming(0, T)).toBeUndefined()
    expect(settlePosIncoming(-500, T)).toBeUndefined()
    localStorage.clear()
    expect(settlePosIncoming(1_000, T)).toBeUndefined()
  })

  it('keeps a displayed sale open for another window', () => {
    const sale = open(1_000, 'coffee', T)
    keepPosSaleOpen(sale.id, T + 10 * 60_000)
    expect(getPosPayment(sale.id)?.openUntil).toBe(T + 10 * 60_000 + POS_SALE_WINDOW_MS)
  })
})

describe('expiring sales', () => {
  afterEach(() => localStorage.clear())
  const T = 1_000_000

  it('deletes expired unpaid sales and leaves open ones', () => {
    const expired = createPosPayment(newSale, T)
    const stillOpen = createPosPayment(newSale, T + POS_SALE_WINDOW_MS)

    expirePosSales(T + POS_SALE_WINDOW_MS + 1)

    expect(getPosPayment(expired.id)).toBeUndefined()
    expect(getPosPayment(stillOpen.id)?.status).toBe('pending')
  })

  it('keeps a partly paid sale as completed for what arrived, at the sale rate', () => {
    const sale = createPosPayment({ ...newSale, sats: 2_000, fiatAmount: 10, fiatCurrency: 'EUR' }, T)
    settlePosIncoming(500, T + 1)

    expirePosSales(T + POS_SALE_WINDOW_MS + 1)

    expect(getPosPayment(sale.id)).toMatchObject({ status: 'completed', receivedSats: 500, fiatAmount: 2.5 })
  })
})
