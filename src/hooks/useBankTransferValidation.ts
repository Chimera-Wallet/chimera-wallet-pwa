/**
 * Bank Transfer Validation Hook
 *
 * Provides validation logic for bank transfers including:
 * - Minimum amount validation
 * - KYC threshold checking
 * - Integration with existing KYC system
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  getBankTransferConfig,
  getBankTransferConfigSync,
  meetsMinimumAmount,
  requiresKyc,
  type BankTransferConfig,
  type BankCurrency,
} from '../lib/bankTransferConfig'
import { getKycEmail, type KycStatus } from '../lib/kyc'

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
  // Refresh counter triggers re-read of email from localStorage
  const [refreshCount, setRefreshCount] = useState(0)

  // Load config on mount
  useEffect(() => {
    getBankTransferConfig().then(setConfig)
  }, [])

  // Refresh KYC status (re-reads email from localStorage)
  const refreshKycStatus = useCallback(() => {
    setRefreshCount((c) => c + 1)
  }, [])

  // Email presence is the source of truth for KYC verification
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const kycEmail = useMemo(() => getKycEmail(), [refreshCount])
  const kycVerified = !!kycEmail
  // Derive kycStatus for interface compatibility
  const kycStatus: KycStatus = kycVerified ? 'confirmed' : 'not_started'

  // Calculate validation state
  const isValidAmount = amount > 0 && meetsMinimumAmount(amount)
  const kycRequired = requiresKyc(amount)
  const canProceed = isValidAmount && (!kycRequired || kycVerified)

  // Generate error message (user-facing messages unchanged)
  let errorMessage: string | null = null
  if (amount > 0 && !isValidAmount) {
    errorMessage = `Minimum amount is ${config.minimumOrderValue} ${currency}`
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
