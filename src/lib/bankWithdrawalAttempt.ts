import type { BankOrder } from '../providers/bankTransfer'

export type BankWithdrawalFundingState = 'funding' | 'funded'

export interface BankWithdrawalAttempt {
  order: BankOrder
  fundingAddress: string
  amountSats: number
  fundingState: BankWithdrawalFundingState
}

const STORAGE_KEY = 'pending_bank_withdrawal'

export const getPendingBankWithdrawal = (): BankWithdrawalAttempt | undefined => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return
    const attempt = JSON.parse(stored) as BankWithdrawalAttempt
    if (!attempt.order?.id || !attempt.fundingAddress || !Number.isSafeInteger(attempt.amountSats) || attempt.amountSats <= 0) return
    return attempt
  } catch {
    return
  }
}

export const savePendingBankWithdrawal = (attempt: BankWithdrawalAttempt): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(attempt))
}

export const clearPendingBankWithdrawal = (): void => {
  localStorage.removeItem(STORAGE_KEY)
}
