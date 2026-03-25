/**
 * Bank Receive (Deposit) Screen
 *
 * Allows users to deposit fiat currency via bank transfer to receive crypto.
 * Shows bank details (SEPA/SWIFT) where user should send their fiat.
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
  SepaDataView,
  SwiftDataView,
  TransferReferenceBox,
  BankCircuitSelector,
  BankCurrencySelector,
} from '../../../components/BankDetails'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { FlowContext } from '../../../providers/flow'
import { WalletContext } from '../../../providers/wallet'
import { createBankDeposit, ChimeraOrder } from '../../../providers/chimera'
import { getReceivingAddresses } from '../../../lib/asp'
import { useBankTransferValidation } from '../../../hooks/useBankTransferValidation'
import {
  getBankTransferConfigSync,
  getDefaultCircuit,
  type BankCircuit,
  type BankCurrency,
} from '../../../lib/bankTransferConfig'
import { prettyNumber } from '../../../lib/format'

export default function BankReceive() {
  const { navigate, goBack } = useContext(NavigationContext)
  const { bankRecvInfo, setBankRecvInfo } = useContext(FlowContext)
  const { svcWallet } = useContext(WalletContext)

  const config = getBankTransferConfigSync()

  // Form state
  const [currency, setCurrency] = useState<BankCurrency>(bankRecvInfo.currency || config.defaultCurrency)
  const [circuit, setCircuit] = useState<BankCircuit>(bankRecvInfo.circuit || getDefaultCircuit(currency))
  const [amount, setAmount] = useState<string>(bankRecvInfo.amount > 0 ? String(bankRecvInfo.amount) : '')
  const [email, setEmail] = useState<string>('')
  
  // API state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [order, setOrder] = useState<ChimeraOrder | null>(bankRecvInfo.order ?? null)
  const [arkAddress, setArkAddress] = useState<string>('')

  // Validation
  const numAmount = parseFloat(amount) || 0
  const validation = useBankTransferValidation({ amount: numAmount, currency })

  // Load ark address on mount
  useEffect(() => {
    const loadAddress = async () => {
      if (svcWallet) {
        try {
          const addresses = await getReceivingAddresses(svcWallet)
          setArkAddress(addresses.offchainAddr)
        } catch (err) {
          console.error('Failed to load Ark address:', err)
        }
      }
    }
    loadAddress()
  }, [svcWallet])

  // Update circuit when currency changes
  useEffect(() => {
    setCircuit(getDefaultCircuit(currency))
  }, [currency])

  const handleAmountChange = (value: string) => {
    // Allow only numbers and decimal point
    if (/^\d*\.?\d*$/.test(value)) {
      setAmount(value)
    }
  }

  const handleCreateDeposit = async () => {
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

    if (!arkAddress) {
      setError('Unable to get destination address')
      return
    }

    try {
      setLoading(true)
      setError('')

      const response = await createBankDeposit({
        email,
        from_amount: numAmount,
        from_asset: currency,
        to_asset: 'BTC',
        destination_address: arkAddress,
      })

      if (response.kycError) {
        setError('KYC verification required')
        navigate(Pages.SettingsKYC)
        return
      }

      if (response.order) {
        setOrder(response.order)
        setBankRecvInfo({
          currency,
          circuit,
          amount: numAmount,
          order: response.order,
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create deposit order')
    } finally {
      setLoading(false)
    }
  }

  const handleComplete = () => {
    navigate(Pages.Wallet)
  }

  const handleViewStatus = () => {
    if (order) {
      setBankRecvInfo({ ...bankRecvInfo, order })
      navigate(Pages.BankOrderStatus)
    }
  }

  // Show order details if we have one
  if (order) {
    const hasSepaDetails = Boolean(order.deposit_sepa_address)
    const hasSwiftDetails = Boolean(order.deposit_swift_address)

    return (
      <>
        <Header text='Bank Deposit' back={goBack} />
        <Content>
          <Padded>
            <FlexCol gap='1.5rem'>
              <Info color='blue' title='Send Bank Transfer'>
                <TextSecondary>
                  Transfer {prettyNumber(numAmount, 2)} {currency} to the bank details below.
                  Your Bitcoin will be credited once the transfer is confirmed.
                </TextSecondary>
              </Info>

              {/* Transfer Reference - Most Important */}
              {order.transfer_code ? (
                <TransferReferenceBox reference={order.transfer_code} />
              ) : null}

              {/* Circuit Selection */}
              {hasSepaDetails && hasSwiftDetails ? (
                <FlexCol gap='0.5rem'>
                  <TextLabel>Transfer Method</TextLabel>
                  <BankCircuitSelector
                    currency={currency}
                    selectedCircuit={circuit}
                    onSelect={setCircuit}
                  />
                </FlexCol>
              ) : null}

              {/* Bank Details */}
              {circuit === 'sepa' && hasSepaDetails ? (
                <FlexCol gap='0.5rem'>
                  <TextLabel>SEPA Bank Details</TextLabel>
                  <SepaDataView
                    iban={order.deposit_sepa_address}
                    bic={order.deposit_sepa_bic}
                    beneficiary={order.deposit_sepa_beneficiary}
                    beneficiaryAddress={order.deposit_sepa_beneficiary_address}
                    bankName={order.deposit_sepa_bank_name}
                    bankAddress={order.deposit_sepa_bank_address}
                  />
                </FlexCol>
              ) : null}

              {(circuit === 'swift' || !hasSepaDetails) && hasSwiftDetails ? (
                <FlexCol gap='0.5rem'>
                  <TextLabel>SWIFT Bank Details</TextLabel>
                  <SwiftDataView
                    iban={order.deposit_swift_address}
                    bic={order.deposit_swift_bic}
                    intermediaryBic={order.deposit_swift_intermediary_address}
                    beneficiary={order.deposit_swift_beneficiary}
                    beneficiaryAddress={order.deposit_swift_beneficiary_address}
                    bankName={order.deposit_swift_bank_name}
                    bankAddress={order.deposit_swift_bank_address}
                  />
                </FlexCol>
              ) : null}
            </FlexCol>
          </Padded>
        </Content>
        <ButtonsOnBottom>
          <Button label="I've Made the Transfer" onClick={handleComplete} />
          <Button label='View Order Status' onClick={handleViewStatus} secondary />
        </ButtonsOnBottom>
      </>
    )
  }

  // Show form if no order yet
  return (
    <>
      <Header text='Bank Deposit' back={goBack} />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
            <ErrorMessage error={Boolean(error)} text={error} />

            <Info color='blue' title='Deposit via Bank Transfer'>
              <TextSecondary>
                Transfer fiat currency from your bank account to receive Bitcoin.
                Minimum deposit: {config.minimumOrderValue} {currency}
              </TextSecondary>
            </Info>

            {/* Currency Selection */}
            <FlexCol gap='0.5rem'>
              <TextLabel>Currency</TextLabel>
              <BankCurrencySelector selectedCurrency={currency} onSelect={setCurrency} />
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
              {Boolean(validation.errorMessage) && (
                <Text small color='orange'>
                  {validation.errorMessage}
                </Text>
              )}
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
          label={loading ? 'Creating Order...' : 'Continue'}
          onClick={handleCreateDeposit}
          disabled={!validation.canProceed || !email || loading}
          loading={loading}
        />
      </ButtonsOnBottom>
    </>
  )
}
