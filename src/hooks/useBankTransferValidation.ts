/**
 * Bank Transfer Validation Hook
 *
 * Provides validation logic for bank transfers including:
 * - Minimum amount validation
 * - KYC threshold checking
 * - Integration with existing KYC system
 */

import { useState, useEffect, useCallback } from 'react'
import {
  getBankTransferConfig,
  getBankTransferConfigSync,
  getMinimumOrderValue,
  meetsMinimumAmount,
  requiresKyc,
  DEFAULT_BANK_CURRENCY,
  type BankTransferConfig,
  type BankCircuit,
  type BankCurrency,
} from '../lib/bankTransferConfig'
import { fetchAuthoritativeKycStatus, type KycStatus } from '../lib/kyc'

export interface BankTransferValidation {
  /** Whether the amount meets minimum requirements */
  isValidAmount: boolean
  /** Whether KYC is required for this amount */
  kycRequired: boolean
  /** Current KYC status */
  kycStatus: KycStatus
  /** Whether KYC is verified (confirmed status) */
  kycVerified: boolean
  /** Whether the transfer can proceed (valid amount and KYC if required) */
  canProceed: boolean
  /** Validation error message if any */
  errorMessage: string | null
  /** The minimum order value */
  minimumAmount: number
  /** The KYC threshold */
  kycThreshold: number
  /** Re-check KYC status */
  refreshKycStatus: () => void
}

interface UseBankTransferValidationParams {
  amount: number
  currency?: BankCurrency
  circuit?: BankCircuit
}

/**
 * Hook to validate bank transfer amounts and KYC requirements
 *
 * @param params - Validation parameters
 * @returns BankTransferValidation object with validation state and helpers
 */
export function useBankTransferValidation({
  amount,
  currency = DEFAULT_BANK_CURRENCY,
  circuit,
}: UseBankTransferValidationParams): BankTransferValidation {
  const [config, setConfig] = useState<BankTransferConfig>(getBankTransferConfigSync())
  const [kycStatus, setKycStatus] = useState<KycStatus>('not_started')
  // Refresh counter triggers a server-side KYC status check.
  const [refreshCount, setRefreshCount] = useState(0)

  // Load config on mount
  useEffect(() => {
    getBankTransferConfig().then(setConfig)
  }, [])

  // Refresh KYC status from the provider rather than treating local data as proof.
  const refreshKycStatus = useCallback(() => {
    setRefreshCount((c) => c + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchAuthoritativeKycStatus().then((status) => {
      if (!cancelled) setKycStatus(status ?? 'not_started')
    })
    return () => {
      cancelled = true
    }
  }, [refreshCount])

  const kycVerified = kycStatus === 'confirmed'

  // Calculate validation state
  const minimumAmount = getMinimumOrderValue(circuit)
  const isValidAmount = amount > 0 && meetsMinimumAmount(amount, circuit)
  const kycRequired = requiresKyc(amount)
  const canProceed = isValidAmount && (!kycRequired || kycVerified)

  // Generate error message (user-facing messages unchanged)
  let errorMessage: string | null = null
  if (amount > 0 && !isValidAmount) {
    errorMessage = `Minimum amount is ${minimumAmount} ${currency}`
  } else if (kycRequired && !kycVerified) {
    errorMessage = `Amounts over ${config.kycThreshold} ${currency} require KYC verification.`
  }

  return {
    isValidAmount,
    kycRequired,
    kycStatus,
    kycVerified,
    canProceed,
    errorMessage,
    minimumAmount,
    kycThreshold: config.kycThreshold,
    refreshKycStatus,
  }
}

/**
 * Synchronous validation helper (for non-hook contexts)
 *
 * @param amount - The amount to validate
 * @returns Object with validation results
 */
export function validateBankTransferAmount(amount: number): {
  isValid: boolean
  kycRequired: boolean
  minimumAmount: number
  kycThreshold: number
} {
  const config = getBankTransferConfigSync()
  return {
    isValid: amount >= config.minimumOrderValue,
    kycRequired: amount > config.kycThreshold,
    minimumAmount: config.minimumOrderValue,
    kycThreshold: config.kycThreshold,
  }
}
