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
import { TextLabel, TextSecondary } from '../../../components/Text'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import ErrorMessage from '../../../components/Error'
import Info, { InfoLine } from '../../../components/Info'
import InfoContainer from '../../../components/InfoContainer'
import AssetSelector from '../../../components/AssetSelector'
import NetworkSelector from '../../../components/NetworkSelector'
import InlineAmountInput from '../../../components/InlineAmountInput'
import BankTransferValidationMessages from '../../../components/BankTransferValidation'
import type { AssetSymbol } from '../../../lib/assets'
import { TRANSFER_METHOD, TERMS_AND_CONDITIONS, type TransferMethod, type InfoItemIcon } from '../../../lib/transferMethods'
import { prettyNumber } from '../../../lib/format'
import WhenIcon from '../../../icons/When'
import FeesIcon from '../../../icons/Fees'
import InfoIcon from '../../../icons/Info'
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
import { getUserEmailForBankTransfer } from '../../../lib/kyc'

export default function BankReceive() {
  const { navigate, goBack } = useContext(NavigationContext)
  const { bankRecvInfo, setBankRecvInfo, recvInfo, setRecvInfo } = useContext(FlowContext)
  const { svcWallet } = useContext(WalletContext)

  const bankConfig = getBankTransferConfigSync()

  // Asset and network state (matching ReceiveAmount layout)
  const [selectedAsset, setSelectedAsset] = useState<AssetSymbol>('BTC')
  const selectedMethod: TransferMethod = recvInfo.method ?? TRANSFER_METHOD.bank

  // Form state
  const [currency, setCurrency] = useState<BankCurrency>(bankRecvInfo.currency || bankConfig.defaultCurrency)
  const [circuit, setCircuit] = useState<BankCircuit>(bankRecvInfo.circuit || getDefaultCircuit(currency))
  const [amount, setAmount] = useState<number>(bankRecvInfo.amount || 0)
  
  // API state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [order, setOrder] = useState<ChimeraOrder | null>(bankRecvInfo.order ?? null)
  const [arkAddress, setArkAddress] = useState<string>('')

  // Validation
  const numAmount = amount
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

  const handleCreateDeposit = async () => {
    if (!validation.canProceed) {
      if (!validation.kycVerified && validation.kycRequired) {
        navigate(Pages.SettingsKYC)
        return
      }
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
        email: getUserEmailForBankTransfer(),
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
      } else {
        setError('Failed to create order - no order returned')
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
      <Header text='Receive' back={goBack} />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
            <ErrorMessage error={Boolean(error)} text={error} />

            {/* Amount Input */}
            <InlineAmountInput
              value={amount}
              onChange={setAmount}
              asset={selectedAsset}
              bankCurrency={currency}
            />

            <AssetSelector
              label='Asset'
              selected={selectedAsset}
              onSelect={setSelectedAsset}
            />
            <NetworkSelector
              label='Network'
              selected={selectedMethod}
              onSelect={(network) => {
                if (network !== TRANSFER_METHOD.bank) {
                  setRecvInfo({ ...recvInfo, method: network })
                  navigate(Pages.ReceiveAmount)
                }
              }}
            />

            {/* Currency Selection */}
            <FlexCol gap='0.5rem'>
              <TextLabel>Currency</TextLabel>
              <BankCurrencySelector selectedCurrency={currency} onSelect={setCurrency} />
            </FlexCol>

            {/* Bank Transfer Terms & Conditions */}
            <InfoContainer>
              {TERMS_AND_CONDITIONS.receive.bank.map((item) => {
                const getIcon = (iconType?: InfoItemIcon) => {
                  switch (iconType) {
                    case 'time': return <WhenIcon />
                    case 'fees': return <FeesIcon />
                    case 'info': return <InfoIcon />
                    default: return <InfoIcon />
                  }
                }
                return (
                  <InfoLine
                    key={item.text}
                    compact
                    color={item.color}
                    icon={getIcon(item.icon)}
                    text={item.text}
                  />
                )
              })}
            </InfoContainer>

            {/* Validation and KYC messages */}
            <BankTransferValidationMessages validation={validation} />
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button
          label={loading ? 'Creating Order...' : 'Continue'}
          onClick={handleCreateDeposit}
          disabled={!validation.canProceed || loading}
          loading={loading}
        />
      </ButtonsOnBottom>
    </>
  )
}
