/**
 * Bank Receive (Deposit) Screen
 *
 * Allows users to deposit fiat currency via bank transfer to receive crypto.
 * Shows the bank details (SEPA or SWIFT — whichever ramp-system returns for
 * the chosen currency) where the user should send their fiat.
 */

import { useContext, useEffect, useState } from 'react'
import Content from '../../../components/Content'
import FlexCol from '../../../components/FlexCol'
import Header from '../../../components/Header'
import Padded from '../../../components/Padded'
import { TextSecondary } from '../../../components/Text'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import ErrorMessage from '../../../components/Error'
import Info, { InfoLine } from '../../../components/Info'
import InfoContainer from '../../../components/InfoContainer'
import AssetSelector from '../../../components/AssetSelector'
import NetworkSelector from '../../../components/NetworkSelector'
import InlineAmountInput from '../../../components/InlineAmountInput'
import BankTransferValidationMessages from '../../../components/BankTransferValidation'
import { BANK_TRANSFER_ASSET_LIST, requireAssetConfig, type AssetSymbol } from '../../../lib/assets'
import {
  TRANSFER_METHOD,
  TERMS_AND_CONDITIONS,
  type TransferMethod,
  type InfoItemIcon,
} from '../../../lib/transferMethods'
import { prettyNumber } from '../../../lib/format'
import WhenIcon from '../../../icons/When'
import FeesIcon from '../../../icons/Fees'
import InfoIcon from '../../../icons/Info'
import TransactionsIcon from '../../../icons/Transactions'
import { SepaDataView, SwiftDataView, TransferReferenceBox, BankCurrencySelector } from '../../../components/BankDetails'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { FlowContext } from '../../../providers/flow'
import { WalletContext } from '../../../providers/wallet'
import { TxResultContext } from '../../../providers/txResult'
import { createOnRampOrder, type RampOrder, type RampBankDetails } from '../../../providers/ramp'
import { getReceivingAddresses } from '../../../lib/asp'
import { addOrderToHistory } from '../../../lib/bankOrderHistory'
import { useBankTransferValidation } from '../../../hooks/useBankTransferValidation'
import {
  getBankTransferConfigSync,
  getSupportedReceiveCurrencies,
  type BankCurrency,
} from '../../../lib/bankTransferConfig'
import { getUserEmailForBankTransfer } from '../../../lib/kyc'
import receiptIcon from '../../../../public/images/icons/ ReceiptReceipt.png'
import clockIcon from '../../../../public/images/icons/ Clock.svg'
import infoIcon from '../../../../public/images/icons/IconInfoIcon.png'
import rightIcon from '../../../../public/images/icons/ Right.png'
import i18n from '../../../lib/i18n'
import { useTranslation } from 'react-i18next'

export default function BankReceive() {
  const { navigate, goBack } = useContext(NavigationContext)
  const { bankRecvInfo, setBankRecvInfo, recvInfo, setRecvInfo, setCurrentBankOrderType } = useContext(FlowContext)
  const { svcWallet } = useContext(WalletContext)
  const { notifyResult } = useContext(TxResultContext)

  const bankConfig = getBankTransferConfigSync()

  const { t } = useTranslation()

  // Asset and network state (matching ReceiveAmount layout)
  const [selectedAsset, setSelectedAsset] = useState<AssetSymbol>('BTC')
  const selectedMethod: TransferMethod = recvInfo.method ?? TRANSFER_METHOD.bank

  // Form state
  const [currency, setCurrency] = useState<BankCurrency>(bankRecvInfo.currency || bankConfig.defaultCurrency)
  const [amount, setAmount] = useState<number>(bankRecvInfo.amount || 0)

  // API state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [order, setOrder] = useState<RampOrder | null>(bankRecvInfo.order ?? null)
  const [bankDetails, setBankDetails] = useState<RampBankDetails | null>(bankRecvInfo.bankDetails ?? null)
  const [arkAddress, setArkAddress] = useState<string>('')

  // Validation — ramp-system doesn't offer a sepa/swift choice for deposits
  // (it returns one bank account per currency), so circuit is fixed to sepa
  // purely for the validation hook's threshold/currency checks.
  const numAmount = amount
  const validation = useBankTransferValidation({ amount: numAmount, currency, circuit: 'sepa' })

  const handleOrderHistory = () => {
    navigate(Pages.BankOrderHistory)
  }

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

  const handleCreateDeposit = async () => {
    if (!validation.canProceed) {
      if (!validation.kycVerified && validation.kycRequired) {
        navigate(Pages.SettingsKYC)
        return
      }
      return
    }

    if (!arkAddress) {
      setError(t('errors.receive.general.destination'))
      return
    }

    try {
      setLoading(true)
      setError('')

      const response = await createOnRampOrder({
        email: getUserEmailForBankTransfer(),
        asset: requireAssetConfig(selectedAsset).symbol,
        fiat_currency: currency,
        fiat_amount: String(numAmount),
        destination_crypto_address: arkAddress,
        origin: 'app',
      })

      setOrder(response.order)
      setBankDetails(response.bank_details)
      setBankRecvInfo({
        currency,
        circuit: 'sepa',
        amount: numAmount,
        order: response.order,
        bankDetails: response.bank_details,
      })
      // Track this as the current order and add to history
      setCurrentBankOrderType('receive')
      addOrderToHistory(response.order, 'receive')
      // Success popup; the screen then shows the bank transfer details (no redirect)
      notifyResult(true, 'Deposit order created')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create deposit order'
      if (/kyc/i.test(message)) {
        setError(message)
        navigate(Pages.SettingsKYC)
        return
      }
      setError(message)
      notifyResult(false, 'Failed to create order')
    } finally {
      setLoading(false)
    }
  }

  const handleComplete = () => {
    navigate(Pages.Wallet)
  }

  const handleViewStatus = () => {
    if (order) {
      setCurrentBankOrderType('receive')
      setBankRecvInfo({ ...bankRecvInfo, order })
      navigate(Pages.BankOrderStatus)
    }
  }

  // Show order details if we have one
  if (order && bankDetails) {
    const DataView = bankDetails.payment_type === 'swift' ? SwiftDataView : SepaDataView

    return (
      <>
        <Header
          text={t('common.notifications.receive.bank.bankDeposit')}
          back={goBack}
          auxIcon={<TransactionsIcon />}
          auxFunc={handleOrderHistory}
          auxAriaLabel= {t('common.notifications.receive.bank.orderHistory')}
        />
        <Content>
          <Padded>
            <FlexCol gap='1.5rem'>
              <Info color='blue' title={t('common.notifications.receive.bank.sendTransfer')}>
                <TextSecondary>
                  {t('common.notifications.receive.bank.transferDetails', {amount: prettyNumber(numAmount, 2), currency })}
                </TextSecondary>
              </Info>

              {/* Transfer Reference - Most Important */}
              <TransferReferenceBox reference={bankDetails.transfer_code} />

              {/* Bank Details */}
              <FlexCol gap='0.5rem'>
                <DataView
                  iban={bankDetails.iban}
                  bic={bankDetails.bic}
                  beneficiary={bankDetails.beneficiary}
                  bankName={bankDetails.bank_name}
                />
              </FlexCol>
            </FlexCol>
          </Padded>
        </Content>
        <ButtonsOnBottom>
          <Button label= {t('common.notifications.receive.bank.madeTransfer')} onClick={handleComplete} />
          <Button label={t('common.notifications.receive.bank.orderStatus')} onClick={handleViewStatus} secondary />
        </ButtonsOnBottom>
      </>
    )
  }

  // Show form if no order yet
  return (
    <>
      <Header
        text=''
        back={goBack}
        auxIcon={<TransactionsIcon />}
        auxFunc={handleOrderHistory}
        auxAriaLabel={t('common.notifications.receive.bank.orderHistory')}
      />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
            <ErrorMessage error={Boolean(error)} text={error} />

            {/* Amount Input */}
            <InlineAmountInput value={amount} onChange={setAmount} asset={selectedAsset} bankCurrency={currency} />

            <div style={{ display: 'flex', justifyContent: 'center' , width: '100%'}}>
              <div style={{ width: '200px' }}>
                <AssetSelector label = '' assets={BANK_TRANSFER_ASSET_LIST} selected={selectedAsset} onSelect={setSelectedAsset} showValue
                style = {{
                         justifyContent: 'center',
                         width: '235px',
                         height: '36px',
                         borderRadius : '2.5rem',
                         fontSize: '14px',
                         fontWeight: '600',
                }} />
            </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100', gap:'1rem'}}>

            <NetworkSelector
              assetSymbol={selectedAsset}
              label=''
              selected={selectedMethod}
              onSelect={(network) => {
                if (network !== TRANSFER_METHOD.bank) {
                  setRecvInfo({ ...recvInfo, method: network })
                  navigate(Pages.ReceiveAmount)
                }
              }}
              style = {{
                borderRadius : '2.5rem',
              }}
            />

            {/* Currency Selection */}
            <FlexCol gap='0.5rem'>
              <BankCurrencySelector selectedCurrency={currency} onSelect={setCurrency} currencies={getSupportedReceiveCurrencies()} />
            </FlexCol>

            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' , width: '100', marginTop: '1rem'}}>
            {/* Bank Transfer Terms & Conditions */}
            <InfoContainer>
              {TERMS_AND_CONDITIONS.receive.bank.map((item) => {
                const getIcon = (iconType?: InfoItemIcon) => {
                  switch (iconType) {
                    case 'time':
                      return <WhenIcon />
                    case 'fees':
                      return <FeesIcon />
                    case 'info':
                      return <img src = {infoIcon} alt = 'info' style = {{width: '16px', height: '16px', filter: 'brightness(0) invert(0.7)'}} />
                    case 'receipt':
                      return <img src = {receiptIcon} alt = 'receipt' style = {{width: '16px', height: '16px', filter: 'brightness(0) invert(0.7)'}} />
                    case 'clock':
                      return <img src = {clockIcon} alt = 'clock' style = {{width: '16px', height: '16px',filter: 'brightness(0) invert(0.7)'}} />
                    default:
                      return <InfoIcon />
                  }
                }
                return (
                  <InfoLine key={item.text} compact color={item.color} icon={getIcon(item.icon)} text={t(item.text)} />
                )
              })}
            </InfoContainer>
            </div>
            </div>

            {/* Validation and KYC messages */}
            <BankTransferValidationMessages validation={validation} />
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button
          label={loading ? t('common.notifications.bank.creatingOrder') : t('common.general.continue')}
          onClick={handleCreateDeposit}
          icon = {<img src = {rightIcon} alt = 'rightArrow' style = {{width: '16px', height: '16px', filter: 'brightness(0) invert(0.7)', marginLeft: '0.5rem'}} />}
          disabled={!validation.canProceed || loading}
          loading={loading}
          style = {{ margin: '4px 0', fontFamily: 'Titillium Web', fontStyle:'semibold', fontWeight : 600, width: '100%', height: '48px', borderRadius: '16px',}}
        />
      </ButtonsOnBottom>
    </>
  )
}
