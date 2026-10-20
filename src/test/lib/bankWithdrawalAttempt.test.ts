import { afterEach, describe, expect, it } from 'vitest'
import {
  type BankWithdrawalAttempt,
  clearPendingBankWithdrawal,
  getPendingBankWithdrawal,
  savePendingBankWithdrawal,
} from '../../lib/bankWithdrawalAttempt'

const attempt = {
  order: { id: 'order-1' },
  fundingAddress: 'ark1fundingaddress',
  amountSats: 50_000,
  fundingState: 'funding' as const,
} as BankWithdrawalAttempt

describe('bank withdrawal attempts', () => {
  afterEach(clearPendingBankWithdrawal)

  it('retains the exact order and funding details while payment is pending', () => {
    savePendingBankWithdrawal(attempt)

    expect(getPendingBankWithdrawal()).toEqual(attempt)
  })

  it('ignores malformed persisted attempts', () => {
    localStorage.setItem('pending_bank_withdrawal', JSON.stringify({ order: { id: 'order-1' }, amountSats: 0 }))

    expect(getPendingBankWithdrawal()).toBeUndefined()
  })
})
