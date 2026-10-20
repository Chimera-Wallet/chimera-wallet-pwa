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
  getMinimumOrderValue,
  limitsFor,
  requiresKyc,
  DEFAULT_BANK_CURRENCY,
  type BankCircuit,
  type BankCurrency,
} from '../lib/bankTransferConfig'
import { fetchAuthoritativeKycStatus, type KycStatus } from '../lib/kyc'
import { useBankTransferConfig } from './useBankTransferConfig'

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
  /** Set false to skip the KYC status request while the result isn't needed. */
  enabled?: boolean
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
  enabled = true,
}: UseBankTransferValidationParams): BankTransferValidation {
  // The provider's limits (ramp's, when it's the provider): every check below
  // reads this one config.
  const config = useBankTransferConfig()
  const [kycStatus, setKycStatus] = useState<KycStatus>('not_started')
  // Refresh counter triggers a server-side KYC status check.
  const [refreshCount, setRefreshCount] = useState(0)

  // Refresh KYC status from the provider rather than treating local data as proof.
  const refreshKycStatus = useCallback(() => {
    setRefreshCount((c) => c + 1)
  }, [])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fetchAuthoritativeKycStatus().then((status) => {
      if (!cancelled) setKycStatus(status ?? 'not_started')
    })
    return () => {
      cancelled = true
    }
  }, [refreshCount, enabled])

  const kycVerified = kycStatus === 'confirmed'

  // Calculate validation state
  const { kycThreshold } = limitsFor(config, currency)
  const minimumAmount = getMinimumOrderValue(config, circuit, currency)
  const isValidAmount = amount > 0 && amount >= minimumAmount
  const kycRequired = requiresKyc(config, amount, currency)
  const canProceed = isValidAmount && (!kycRequired || kycVerified)

  let errorMessage: string | null = null
  if (amount > 0 && !isValidAmount) {
    errorMessage = `Minimum amount is ${minimumAmount} ${currency}`
  } else if (kycRequired && !kycVerified) {
    errorMessage = `Amounts of ${kycThreshold} ${currency} or more require KYC verification.`
  }

  return {
    isValidAmount,
    kycRequired,
    kycStatus,
    kycVerified,
    canProceed,
    errorMessage,
    minimumAmount,
    kycThreshold,
    refreshKycStatus,
  }
}
