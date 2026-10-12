import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ServiceWorkerWallet } from '@arkade-os/sdk'
import { fundBankWithdrawal, resolvePendingBankWithdrawal } from '../../lib/bankWithdrawalFlow'
import { getPosPayment, setBtcPayout, setFiatPayout, type PosPayment } from '../../lib/pos'
import { convertPosPayment, isConversionInterrupted, resumePosConversions } from '../../lib/posConversion'
import { clearPendingBankWithdrawal, savePendingBankWithdrawal } from '../../lib/bankWithdrawalAttempt'
import { getBankOrderStatus, type BankOrder } from '../../providers/bankTransfer'

vi.mock('../../lib/bankWithdrawalFlow', () => ({
  fundBankWithdrawal: vi.fn(),
  resolvePendingBankWithdrawal: vi.fn(),
}))
vi.mock('../../providers/bankTransfer', () => ({ getBankOrderStatus: vi.fn() }))

const deps = { svcWallet: {} as ServiceWorkerWallet, signerPubkey: 'signer' }
const bankData = { circuit: 'swift', destinationBankAddress: 'CH93', bic: 'UBS', accountHolderName: 'Jane' } as never
const order = { id: 'order-9', status: 'WAITING_FOR_DEPOSIT' } as BankOrder

// Seed one stored sale, alongside any already stored
const sale = (overrides: Partial<PosPayment> = {}): PosPayment => {
  const record: PosPayment = {
    id: 'sale-1',
    createdAt: 1,
    note: '',
    method: 'ark',
    sats: 20_000,
    receivedSats: 20_100,
    fiatAmount: 15,
    fiatCurrency: 'CHF',
    payoutCurrency: 'CHF',
    status: 'completed',
    openUntil: 0,
    ...overrides,
  }
  const stored = JSON.parse(localStorage.getItem('pos_payments') ?? '[]')
  localStorage.setItem('pos_payments', JSON.stringify([record, ...stored]))
  return record
}

describe('convertPosPayment', () => {
  afterEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('withdraws the received amount to the saved account and records the order', async () => {
    setFiatPayout('CHF', 'swift', bankData)
    sale()
    vi.mocked(resolvePendingBankWithdrawal).mockResolvedValue({ kind: 'none' })
    vi.mocked(fundBankWithdrawal).mockResolvedValue(order)

    const result = await convertPosPayment('sale-1', deps)

    expect(fundBankWithdrawal).toHaveBeenCalledWith(
      expect.objectContaining({ amountSats: 20_100, currency: 'CHF', circuit: 'swift', bankData, asset: 'BTC' }),
    )
    expect(result?.conversion).toMatchObject({ status: 'submitted', orderId: 'order-9', currency: 'CHF' })
  })

  it('is a no-op for BTC payouts, unpaid sales and already submitted conversions', async () => {
    setBtcPayout()
    sale({ id: 'btc', payoutCurrency: 'BTC' })
    sale({ id: 'open', status: 'pending' })
    sale({ id: 'done', conversion: { status: 'submitted', currency: 'CHF', updatedAt: 0 } })

    await convertPosPayment('btc', deps)
    await convertPosPayment('open', deps)
    await convertPosPayment('done', deps)

    expect(fundBankWithdrawal).not.toHaveBeenCalled()
  })

  it('runs only once when triggered twice concurrently', async () => {
    setFiatPayout('CHF', 'swift', bankData)
    sale()
    vi.mocked(resolvePendingBankWithdrawal).mockResolvedValue({ kind: 'none' })
    vi.mocked(fundBankWithdrawal).mockResolvedValue(order)

    await Promise.all([convertPosPayment('sale-1', deps), convertPosPayment('sale-1', deps)])

    expect(fundBankWithdrawal).toHaveBeenCalledTimes(1)
  })

  it('stops when a previous withdrawal may still be mid-payment', async () => {
    setFiatPayout('CHF', 'swift', bankData)
    sale()
    vi.mocked(resolvePendingBankWithdrawal).mockResolvedValue({ kind: 'awaiting', order, fundingState: 'funding' })

    const result = await convertPosPayment('sale-1', deps)

    expect(fundBankWithdrawal).not.toHaveBeenCalled()
    expect(result?.conversion?.status).toBe('failed')
  })

  it('goes ahead when the previous withdrawal was funded and is awaiting confirmation', async () => {
    setFiatPayout('CHF', 'swift', bankData)
    sale()
    vi.mocked(resolvePendingBankWithdrawal).mockResolvedValue({ kind: 'awaiting', order, fundingState: 'funded' })
    vi.mocked(fundBankWithdrawal).mockResolvedValue(order)

    expect((await convertPosPayment('sale-1', deps))?.conversion?.status).toBe('submitted')
  })

  it('marks the conversion failed, keeping any order id, when the withdrawal fails', async () => {
    setFiatPayout('CHF', 'swift', bankData)
    sale()
    vi.mocked(resolvePendingBankWithdrawal).mockResolvedValue({ kind: 'none' })
    vi.mocked(fundBankWithdrawal).mockImplementation(async ({ onOrderCreated }) => {
      onOrderCreated?.(order)
      throw new Error('payment failed')
    })

    const result = await convertPosPayment('sale-1', deps)

    expect(result?.conversion).toMatchObject({ status: 'failed', orderId: 'order-9', error: 'payment failed' })
    expect(isConversionInterrupted(getPosPayment('sale-1')!)).toBe(false)
  })

  it('fails without a saved bank account', async () => {
    sale()
    const result = await convertPosPayment('sale-1', deps)
    expect(result?.conversion?.status).toBe('failed')
    expect(fundBankWithdrawal).not.toHaveBeenCalled()
  })

  it('flags a stored converting state with nothing running as interrupted', () => {
    const stuck = sale({ conversion: { status: 'converting', currency: 'CHF', updatedAt: 0 } })
    expect(isConversionInterrupted(stuck)).toBe(true)
  })

  describe('when an earlier attempt already registered an order', () => {
    const interrupted = (orderId = 'order-9') =>
      sale({ conversion: { status: 'converting', currency: 'CHF', orderId, updatedAt: 0 } })

    afterEach(clearPendingBankWithdrawal)

    it('marks it submitted without paying again once the provider has the deposit', async () => {
      setFiatPayout('CHF', 'swift', bankData)
      interrupted()
      vi.mocked(getBankOrderStatus).mockResolvedValue({ ...order, status: 'PROCESSING' })

      const result = await convertPosPayment('sale-1', deps)

      expect(result?.conversion).toMatchObject({ status: 'submitted', orderId: 'order-9' })
      expect(fundBankWithdrawal).not.toHaveBeenCalled()
    })

    it('trusts a funded entry for that order while the provider is still catching up', async () => {
      setFiatPayout('CHF', 'swift', bankData)
      interrupted()
      vi.mocked(getBankOrderStatus).mockResolvedValue(order) // WAITING_FOR_DEPOSIT
      savePendingBankWithdrawal({ order, fundingAddress: 'ark1x', amountSats: 20_100, fundingState: 'funded' })

      expect((await convertPosPayment('sale-1', deps))?.conversion?.status).toBe('submitted')
      expect(fundBankWithdrawal).not.toHaveBeenCalled()
    })

    it("refuses to pay again when it can't tell whether the order was funded", async () => {
      setFiatPayout('CHF', 'swift', bankData)
      interrupted()
      vi.mocked(getBankOrderStatus).mockResolvedValue(order) // WAITING_FOR_DEPOSIT, nothing recorded

      const result = await convertPosPayment('sale-1', deps)

      expect(result?.conversion).toMatchObject({ status: 'failed', orderId: 'order-9' })
      expect(fundBankWithdrawal).not.toHaveBeenCalled()
    })

    it('starts a new order when the old one lapsed unfunded', async () => {
      setFiatPayout('CHF', 'swift', bankData)
      interrupted()
      vi.mocked(getBankOrderStatus).mockResolvedValue({ ...order, status: 'EXPIRED' })
      vi.mocked(resolvePendingBankWithdrawal).mockResolvedValue({ kind: 'none' })
      vi.mocked(fundBankWithdrawal).mockResolvedValue({ ...order, id: 'order-10' })

      const result = await convertPosPayment('sale-1', deps)

      expect(fundBankWithdrawal).toHaveBeenCalledTimes(1)
      expect(result?.conversion).toMatchObject({ status: 'submitted', orderId: 'order-10' })
    })
  })

  it('runs conversions one at a time', async () => {
    setFiatPayout('CHF', 'swift', bankData)
    sale({ id: 'a' })
    sale({ id: 'b' })
    vi.mocked(resolvePendingBankWithdrawal).mockResolvedValue({ kind: 'none' })
    let inFlight = 0
    let maxInFlight = 0
    vi.mocked(fundBankWithdrawal).mockImplementation(async () => {
      maxInFlight = Math.max(maxInFlight, ++inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return order
    })

    await Promise.all([convertPosPayment('a', deps), convertPosPayment('b', deps)])

    expect(fundBankWithdrawal).toHaveBeenCalledTimes(2)
    expect(maxInFlight).toBe(1)
  })

  it('resumes conversions that never started or were interrupted, but not failed ones', async () => {
    setFiatPayout('CHF', 'swift', bankData)
    sale({ id: 'never-started' })
    sale({ id: 'interrupted', conversion: { status: 'converting', currency: 'CHF', updatedAt: 0 } })
    sale({ id: 'failed', conversion: { status: 'failed', currency: 'CHF', updatedAt: 0 } })
    sale({ id: 'btc', payoutCurrency: 'BTC' })
    vi.mocked(resolvePendingBankWithdrawal).mockResolvedValue({ kind: 'none' })
    vi.mocked(fundBankWithdrawal).mockResolvedValue(order)

    await resumePosConversions(deps)

    expect(fundBankWithdrawal).toHaveBeenCalledTimes(2)
    expect(getPosPayment('never-started')?.conversion?.status).toBe('submitted')
    expect(getPosPayment('interrupted')?.conversion?.status).toBe('submitted')
    expect(getPosPayment('failed')?.conversion?.status).toBe('failed')
  })
})
