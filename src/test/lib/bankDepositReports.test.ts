import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addUnreportedBankDeposit,
  getUnreportedBankDeposits,
  hasUnreportedBankDeposit,
  removeUnreportedBankDeposit,
  UNREPORTED_DEPOSIT_MAX_AGE_MS,
} from '../../lib/bankDepositReports'

describe('unreported bank deposits', () => {
  afterEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  it('keeps each txid until it is removed', () => {
    addUnreportedBankDeposit('order-1', 'txid-1')
    addUnreportedBankDeposit('order-2', 'txid-2')

    expect(getUnreportedBankDeposits()).toMatchObject([
      { orderId: 'order-1', txid: 'txid-1' },
      { orderId: 'order-2', txid: 'txid-2' },
    ])
    expect(hasUnreportedBankDeposit('order-1')).toBe(true)

    removeUnreportedBankDeposit('order-1')

    expect(getUnreportedBankDeposits()).toMatchObject([{ orderId: 'order-2' }])
    expect(hasUnreportedBankDeposit('order-1')).toBe(false)
  })

  it('keeps the first entry for an order rather than duplicating it', () => {
    addUnreportedBankDeposit('order-1', 'txid-1')
    addUnreportedBankDeposit('order-1', 'txid-1')

    expect(getUnreportedBankDeposits()).toHaveLength(1)
  })

  it('drops entries past the maximum age', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    addUnreportedBankDeposit('old', 'txid-1')
    vi.setSystemTime(UNREPORTED_DEPOSIT_MAX_AGE_MS)
    addUnreportedBankDeposit('new', 'txid-2')
    vi.setSystemTime(UNREPORTED_DEPOSIT_MAX_AGE_MS + 1)

    expect(getUnreportedBankDeposits().map((e) => e.orderId)).toEqual(['new'])
    expect(hasUnreportedBankDeposit('old')).toBe(false)
  })

  it('ignores malformed persisted entries', () => {
    localStorage.setItem(
      'unreported_bank_deposits',
      JSON.stringify([{ orderId: 'order-1' }, { orderId: 'order-2', txid: 'txid-2', createdAt: Date.now() }, null]),
    )
    expect(getUnreportedBankDeposits().map((e) => e.orderId)).toEqual(['order-2'])

    localStorage.setItem('unreported_bank_deposits', '{not json')
    expect(getUnreportedBankDeposits()).toEqual([])
  })

  it('does not throw when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    expect(() => addUnreportedBankDeposit('order-1', 'txid-1')).not.toThrow()
  })
})
