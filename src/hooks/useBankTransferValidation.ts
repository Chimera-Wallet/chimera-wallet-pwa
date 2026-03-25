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
  meetsMinimumAmount,
  requiresKyc,
  type BankTransferConfig,
  type BankCurrency,
} from '../lib/bankTransferConfig'
import { getStoredKycStatus, type KycStatus } from '../lib/kyc'

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
}

/**
 * Hook to validate bank transfer amounts and KYC requirements
 *
 * @param params - Validation parameters
 * @returns BankTransferValidation object with validation state and helpers
 */
export function useBankTransferValidation({
  amount,
  currency = 'EUR',
}: UseBankTransferValidationParams): BankTransferValidation {
  const [config, setConfig] = useState<BankTransferConfig>(getBankTransferConfigSync())
  const [kycStatus, setKycStatus] = useState<KycStatus>(getStoredKycStatus())

  // Load config on mount
  useEffect(() => {
    getBankTransferConfig().then(setConfig)
  }, [])

  // Refresh KYC status
  const refreshKycStatus = useCallback(() => {
    setKycStatus(getStoredKycStatus())
  }, [])

  // Calculate validation state
  const isValidAmount = amount > 0 && meetsMinimumAmount(amount)
  const kycRequired = requiresKyc(amount)
  const kycVerified = kycStatus === 'confirmed'
  const canProceed = isValidAmount && (!kycRequired || kycVerified)

  // Generate error message
  let errorMessage: string | null = null
  if (amount > 0 && !isValidAmount) {
    errorMessage = `Minimum amount is ${config.minimumOrderValue} ${currency}`
  } else if (kycRequired && !kycVerified) {
    if (kycStatus === 'pending') {
      errorMessage = `KYC verification is pending. Amounts over ${config.kycThreshold} ${currency} require verified KYC.`
    } else if (kycStatus === 'rejected') {
      errorMessage = `KYC verification was rejected. Please contact support.`
    } else {
      errorMessage = `Amounts over ${config.kycThreshold} ${currency} require KYC verification.`
    }
  }

  return {
    isValidAmount,
    kycRequired,
    kycStatus,
    kycVerified,
    canProceed,
    errorMessage,
    minimumAmount: config.minimumOrderValue,
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
