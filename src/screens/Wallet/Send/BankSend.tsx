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
import AssetSelector from '../../../components/AssetSelector'
import NetworkSelector from '../../../components/NetworkSelector'
import InlineAmountInput from '../../../components/InlineAmountInput'
import BankTransferValidationMessages from '../../../components/BankTransferValidation'
import { type AssetSymbol } from '../../../lib/assets'
import { TRANSFER_METHOD, type TransferMethod } from '../../../lib/transferMethods'
import TransactionsIcon from '../../../icons/Transactions'
import { BankCircuitSelector, BankCurrencySelector } from '../../../components/BankDetails'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { FlowContext } from '../../../providers/flow'
import { WalletContext } from '../../../providers/wallet'
import { createBankWithdraw, ChimeraOrder } from '../../../providers/chimera'
import { addOrderToHistory } from '../../../lib/bankOrderHistory'
import { useBankTransferValidation } from '../../../hooks/useBankTransferValidation'
import {
  getBankTransferConfigSync,
  getDefaultCircuit,
  getSupportedCircuits,
  type BankCircuit,
  type BankCurrency,
  type BankData,
} from '../../../lib/bankTransferConfig'
import { getUserEmailForBankTransfer } from '../../../lib/kyc'

export default function BankSend() {
  const { navigate, goBack } = useContext(NavigationContext)
  const { bankSendInfo, setBankSendInfo, sendInfo, setSendInfo, setCurrentBankOrderType } = useContext(FlowContext)
  const { balance } = useContext(WalletContext)

  const bankConfig = getBankTransferConfigSync()

  // Asset and network state (matching SendForm layout)
  const [selectedAsset, setSelectedAsset] = useState<AssetSymbol>('BTC')
  const selectedMethod: TransferMethod = sendInfo.method ?? TRANSFER_METHOD.bank

  // Form state
  const [currency, setCurrency] = useState<BankCurrency>(bankSendInfo.currency || bankConfig.defaultCurrency)
  const [circuit, setCircuit] = useState<BankCircuit>(bankSendInfo.circuit || getDefaultCircuit(currency))
  const [amount, setAmount] = useState<number>(bankSendInfo.amount || 0)

  // Bank details form state
  const [iban, setIban] = useState<string>('')
  const [accountHolderName, setAccountHolderName] = useState<string>('')
  const [accountNumber, setAccountNumber] = useState<string>('')
  const [routingNumber, setRoutingNumber] = useState<string>('')

  // API state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Validation
  const numAmount = amount
  const validation = useBankTransferValidation({ amount: numAmount, currency })

  const handleOrderHistory = () => {
    navigate(Pages.BankOrderHistory)
  }

  // Update circuit when currency changes
  useEffect(() => {
    const circuits = getSupportedCircuits(currency)
    if (!circuits.includes(circuit)) {
      setCircuit(getDefaultCircuit(currency))
    }
  }, [currency])

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

    // When KYC email is present, skip bank detail collection entirely
    const skipBankDetails = validation.kycVerified

    let bankData
    if (!skipBankDetails) {
      const validated = validateBankDetails()
      if (!validated) return
      bankData = validated
    }

    try {
      setLoading(true)
      setError('')

      const response = await createBankWithdraw({
        email: getUserEmailForBankTransfer(),
        fromAmount: numAmount,
        fromAsset: 'BTC-ARK',
        toAsset: currency,
        circuit,
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
        // Track this as the current order and add to history
        setCurrentBankOrderType('send')
        addOrderToHistory(response.order, 'send')
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

  // When KYC email is present, bank details are not needed regardless of amount
  const skipBankDetails = validation.kycVerified
  const canSubmit = validation.canProceed && (skipBankDetails || isBankDetailsComplete()) && !loading

  return (
    <>
      <Header
        text='Send'
        back={goBack}
        auxIcon={<TransactionsIcon />}
        auxFunc={handleOrderHistory}
        auxAriaLabel='View order history'
      />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
            <ErrorMessage error={Boolean(error)} text={error} />

            {/* Inline Amount Input with swap functionality */}
            <InlineAmountInput value={amount} onChange={setAmount} asset={selectedAsset} bankCurrency={currency} />

            <AssetSelector label='Asset' selected={selectedAsset} onSelect={setSelectedAsset} />
            <NetworkSelector
              label='Network'
              selected={selectedMethod}
              onSelect={(network) => {
                if (network !== TRANSFER_METHOD.bank) {
                  setSendInfo({ ...sendInfo, method: network })
                  navigate(Pages.SendForm)
                }
              }}
            />

            {/* Currency Selection */}
            <FlexCol gap='0.5rem'>
              <TextLabel>Receive Currency</TextLabel>
              <BankCurrencySelector selectedCurrency={currency} onSelect={setCurrency} />
            </FlexCol>

            {/* Transfer Method */}
            <FlexCol gap='0.5rem'>
              <TextLabel>Transfer Method</TextLabel>
              <BankCircuitSelector currency={currency} selectedCircuit={circuit} onSelect={setCircuit} />
            </FlexCol>

            {/* Bank Details Section - hidden when KYC email bypasses requirement */}
            {!skipBankDetails && (
              <FlexCol gap='1rem'>
                <TextLabel>Bank Details</TextLabel>
                {renderBankInputs()}
              </FlexCol>
            )}

            {/* Validation and KYC messages */}
            <BankTransferValidationMessages validation={validation} />
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
