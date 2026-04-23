/**
 * Bank Transfer Validation Messages Component
 *
 * Displays validation error messages and KYC requirements for bank transfers.
 * Reusable across BankSend and BankReceive screens.
 */

import { useContext } from 'react'
import Info from './Info'
import Button from './Button'
import Text from './Text'
import { NavigationContext, Pages } from '../providers/navigation'
import type { BankTransferValidation } from '../hooks/useBankTransferValidation'

interface BankTransferValidationMessagesProps {
  validation: BankTransferValidation
}

export default function BankTransferValidationMessages({ validation }: BankTransferValidationMessagesProps) {
  const { navigate } = useContext(NavigationContext)

  // No error message to display
  if (!validation.errorMessage) {
    return null
  }

  // Determine if this is a KYC error (requires call-to-action)
  const isKycError = validation.kycRequired && !validation.kycVerified
  const color = isKycError ? 'red' : 'orange'
  const title = isKycError ? 'KYC Required' : 'Validation'

  return (
    <Info color={color} title={title}>
      <Text small thin wrap color={color}>
        {validation.errorMessage}
      </Text>
      {isKycError ? (
        <Button label='Complete Verification' onClick={() => navigate(Pages.SettingsKYC)} secondary />
      ) : null}
    </Info>
  )
}
