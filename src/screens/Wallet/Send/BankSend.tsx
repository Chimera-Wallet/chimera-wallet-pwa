/**
 * Bank Send (Withdraw) Screen
 *
 * Allows users to withdraw crypto to fiat currency via bank transfer.
 * Collects user's bank details where fiat will be sent.
 */

import { useContext, useEffect, useState } from 'react'
import Content from '../../../components/Content'
import FlexCol from '../../../components/FlexCol'
import Header from '../../../components/Header'
import Padded from '../../../components/Padded'
import Text, { TextLabel, TextSecondary } from '../../../components/Text'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import Shadow from '../../../components/Shadow'
import ErrorMessage from '../../../components/Error'
import Info from '../../../components/Info'
// Using native HTML input elements for form fields
import {
  BankCircuitSelector,
  BankCurrencySelector,
} from '../../../components/BankDetails'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { FlowContext } from '../../../providers/flow'
import { WalletContext } from '../../../providers/wallet'
import { createBankWithdraw, ChimeraOrder } from '../../../providers/chimera'
import { useBankTransferValidation } from '../../../hooks/useBankTransferValidation'
import {
  getBankTransferConfigSync,
  getDefaultCircuit,
  getSupportedCircuits,
  type BankCircuit,
  type BankCurrency,
  type BankData,
} from '../../../lib/bankTransferConfig'
import { prettyAmount } from '../../../lib/format'

export default function BankSend() {
  const { navigate, goBack } = useContext(NavigationContext)
  const { bankSendInfo, setBankSendInfo } = useContext(FlowContext)
  const { balance } = useContext(WalletContext)

  const config = getBankTransferConfigSync()

  // Form state
  const [currency, setCurrency] = useState<BankCurrency>(bankSendInfo.currency || config.defaultCurrency)
  const [circuit, setCircuit] = useState<BankCircuit>(bankSendInfo.circuit || getDefaultCircuit(currency))
  const [amount, setAmount] = useState<string>(bankSendInfo.amount > 0 ? String(bankSendInfo.amount) : '')
  const [email, setEmail] = useState<string>('')

  // Bank details form state
  const [iban, setIban] = useState<string>('')
  const [accountHolderName, setAccountHolderName] = useState<string>('')
  const [accountNumber, setAccountNumber] = useState<string>('')
  const [routingNumber, setRoutingNumber] = useState<string>('')

  // API state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Validation
  const numAmount = parseFloat(amount) || 0
  const validation = useBankTransferValidation({ amount: numAmount, currency })

  // Update circuit when currency changes
  useEffect(() => {
    const circuits = getSupportedCircuits(currency)
    if (!circuits.includes(circuit)) {
      setCircuit(getDefaultCircuit(currency))
    }
  }, [currency])

  const handleAmountChange = (value: string) => {
    // Allow only numbers and decimal point
    if (/^\d*\.?\d*$/.test(value)) {
      setAmount(value)
    }
  }

  const validateBankDetails = (): BankData | null => {
    switch (circuit) {
      case 'sepa':
        if (!iban || !accountHolderName) {
          setError('Please enter your IBAN and account holder name')
          return null
        }
        return {
          circuit: 'sepa',
          destinationBankAddress: iban,
          accountHolderName,
        }

      case 'swift':
        if (!iban || !accountHolderName || !accountNumber) {
          setError('Please enter your IBAN, account holder name, and account number')
          return null
        }
        return {
          circuit: 'swift',
          destinationBankAddress: iban,
          accountHolderName,
          accountNumber,
        }

      case 'us':
        if (!accountNumber || !routingNumber) {
          setError('Please enter your account number and routing number')
          return null
        }
        return {
          circuit: 'us',
          accountNumber,
          routingNumber,
        }

      default:
        setError('Invalid transfer method')
        return null
    }
  }

  const handleCreateWithdraw = async () => {
    if (!validation.canProceed) {
      if (!validation.kycVerified && validation.kycRequired) {
        navigate(Pages.SettingsKYC)
        return
      }
      return
    }

    if (!email) {
      setError('Please enter your email address')
      return
    }

    const bankData = validateBankDetails()
    if (!bankData) return

    try {
      setLoading(true)
      setError('')

      const response = await createBankWithdraw({
        email,
        fromAmount: numAmount,
        fromAsset: 'BTC',
        toAsset: currency,
        bankData,
      })

      if (response.order) {
        setBankSendInfo({
          currency,
          circuit,
          amount: numAmount,
          bankData,
          order: response.order,
        })
        // Navigate to order status page
        navigate(Pages.BankOrderStatus)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create withdrawal order')
    } finally {
      setLoading(false)
    }
  }

  // Render bank detail inputs based on circuit
  const renderBankInputs = () => {
    switch (circuit) {
      case 'sepa':
        return (
          <>
            <FlexCol gap='0.5rem'>
              <TextLabel>IBAN</TextLabel>
              <Shadow input>
                <input
                  type='text'
                  value={iban}
                  onChange={(e) => setIban(e.target.value.toUpperCase())}
                  placeholder='DE89 3704 0044 0532 0130 00'
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--white)',
                    fontSize: '1rem',
                    outline: 'none',
                  }}
                />
              </Shadow>
            </FlexCol>
            <FlexCol gap='0.5rem'>
              <TextLabel>Account Holder Name</TextLabel>
              <Shadow input>
                <input
                  type='text'
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                  placeholder='John Doe'
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--white)',
                    fontSize: '1rem',
                    outline: 'none',
                  }}
                />
              </Shadow>
            </FlexCol>
          </>
        )

      case 'swift':
        return (
          <>
            <FlexCol gap='0.5rem'>
              <TextLabel>IBAN</TextLabel>
              <Shadow input>
                <input
                  type='text'
                  value={iban}
                  onChange={(e) => setIban(e.target.value.toUpperCase())}
                  placeholder='DE89 3704 0044 0532 0130 00'
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--white)',
                    fontSize: '1rem',
                    outline: 'none',
                  }}
                />
              </Shadow>
            </FlexCol>
            <FlexCol gap='0.5rem'>
              <TextLabel>Account Holder Name</TextLabel>
              <Shadow input>
                <input
                  type='text'
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                  placeholder='John Doe'
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--white)',
                    fontSize: '1rem',
                    outline: 'none',
                  }}
                />
              </Shadow>
            </FlexCol>
            <FlexCol gap='0.5rem'>
              <TextLabel>Account Number</TextLabel>
              <Shadow input>
                <input
                  type='text'
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder='123456789'
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--white)',
                    fontSize: '1rem',
                    outline: 'none',
                  }}
                />
              </Shadow>
            </FlexCol>
          </>
        )

      case 'us':
        return (
          <>
            <FlexCol gap='0.5rem'>
              <TextLabel>Account Number</TextLabel>
              <Shadow input>
                <input
                  type='text'
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder='123456789'
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--white)',
                    fontSize: '1rem',
                    outline: 'none',
                  }}
                />
              </Shadow>
            </FlexCol>
            <FlexCol gap='0.5rem'>
              <TextLabel>Routing Number (ABA)</TextLabel>
              <Shadow input>
                <input
                  type='text'
                  value={routingNumber}
                  onChange={(e) => setRoutingNumber(e.target.value)}
                  placeholder='021000021'
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--white)',
                    fontSize: '1rem',
                    outline: 'none',
                  }}
                />
              </Shadow>
            </FlexCol>
          </>
        )

      default:
        return null
    }
  }

  // Check if bank details are complete
  const isBankDetailsComplete = (): boolean => {
    switch (circuit) {
      case 'sepa':
        return Boolean(iban && accountHolderName)
      case 'swift':
        return Boolean(iban && accountHolderName && accountNumber)
      case 'us':
        return Boolean(accountNumber && routingNumber)
      default:
        return false
    }
  }

  const canSubmit = validation.canProceed && email && isBankDetailsComplete() && !loading

  return (
    <>
      <Header text='Bank Withdrawal' back={goBack} />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
            <ErrorMessage error={Boolean(error)} text={error} />

            <Info color='blue' title='Withdraw to Bank'>
              <TextSecondary>
                Convert your Bitcoin to fiat currency and send to your bank account.
                Minimum withdrawal: {config.minimumOrderValue} {currency}
              </TextSecondary>
            </Info>

            {/* Current Balance */}
            <Shadow fat>
              <FlexCol gap='0.25rem'>
                <TextSecondary>Available Balance</TextSecondary>
                <Text bold>{prettyAmount(balance)}</Text>
              </FlexCol>
            </Shadow>

            {/* Currency Selection */}
            <FlexCol gap='0.5rem'>
              <TextLabel>Receive Currency</TextLabel>
              <BankCurrencySelector selectedCurrency={currency} onSelect={setCurrency} />
            </FlexCol>

            {/* Transfer Method */}
            <FlexCol gap='0.5rem'>
              <TextLabel>Transfer Method</TextLabel>
              <BankCircuitSelector
                currency={currency}
                selectedCircuit={circuit}
                onSelect={setCircuit}
              />
            </FlexCol>

            {/* Amount Input */}
            <FlexCol gap='0.5rem'>
              <TextLabel>Amount ({currency})</TextLabel>
              <Shadow input>
                <input
                  type='text'
                  inputMode='decimal'
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder={`Min ${config.minimumOrderValue}`}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--white)',
                    fontSize: '1rem',
                    outline: 'none',
                  }}
                />
              </Shadow>
              {validation.errorMessage ? (
                <Text small color='orange'>
                  {validation.errorMessage}
                </Text>
              ) : null}
            </FlexCol>

            {/* Email Input */}
            <FlexCol gap='0.5rem'>
              <TextLabel>Email Address</TextLabel>
              <Shadow input>
                <input
                  type='email'
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder='your@email.com'
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--white)',
                    fontSize: '1rem',
                    outline: 'none',
                  }}
                />
              </Shadow>
              <TextSecondary>We'll send order updates to this email</TextSecondary>
            </FlexCol>

            {/* Bank Details Section */}
            <FlexCol gap='1rem'>
              <TextLabel>Bank Details</TextLabel>
              {renderBankInputs()}
            </FlexCol>

            {/* KYC Warning */}
            {validation.kycRequired && !validation.kycVerified ? (
              <Info color='orange' title='KYC Required'>
                <TextSecondary>
                  Amounts over {config.kycThreshold} {currency} require identity verification.
                </TextSecondary>
                <Button
                  label='Complete Verification'
                  onClick={() => navigate(Pages.SettingsKYC)}
                  secondary
                />
              </Info>
            ) : null}
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button
          label={loading ? 'Creating Order...' : 'Create Withdrawal'}
          onClick={handleCreateWithdraw}
          disabled={!canSubmit}
          loading={loading}
        />
      </ButtonsOnBottom>
    </>
  )
}
