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
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import ErrorMessage from '../../../components/Error'
import TermsInfo from '../../../components/TermsInfo'
import AssetSelector from '../../../components/AssetSelector'
import NetworkSelector from '../../../components/NetworkSelector'
import InlineAmountInput from '../../../components/InlineAmountInput'
import BankTransferValidationMessages from '../../../components/BankTransferValidation'
import WaitingForRound from '../../../components/WaitingForRound'
import { BANK_TRANSFER_ASSET_LIST, type AssetSymbol } from '../../../lib/assets'
import { TERMS_AND_CONDITIONS, TRANSFER_METHOD, type TransferMethod } from '../../../lib/transferMethods'
import TransactionsIcon from '../../../icons/Transactions'
import { BankCircuitSelector, BankCurrencySelector, BankDataForm, SwiftSendFeeNotice } from '../../../components/BankDetails'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { FlowContext } from '../../../providers/flow'
import { WalletContext } from '../../../providers/wallet'
import { FiatContext } from '../../../providers/fiat'
import { TxResultContext } from '../../../providers/txResult'
import { prettyNumber, fromSatoshis } from '../../../lib/format'
import {
  fundBankWithdrawal,
  resolvePendingBankWithdrawal,
  WithdrawalWalletNotConfiguredError,
} from '../../../lib/bankWithdrawalFlow'
import { useBankTransferValidation } from '../../../hooks/useBankTransferValidation'
import {
  emptyBankDetailsFields,
  getBankTransferConfigSync,
  getDefaultCircuit,
  getSupportedCircuits,
  getSupportedSendCurrencies,
  toBankData,
  type BankCircuit,
  type BankCurrency,
  type BankData,
  type BankDetailsFields,
} from '../../../lib/bankTransferConfig'
import { getUserEmailForBankTransfer } from '../../../lib/kyc'
import { AspContext } from '@/providers/asp'
import rightIcon from '../../../../public/images/icons/ Right.png'
import {useTranslation} from 'react-i18next'

export default function BankSend() {
  const { navigate, goBack } = useContext(NavigationContext)
  const { bankSendInfo, setBankSendInfo, sendInfo, setSendInfo, setCurrentBankOrderType } = useContext(FlowContext)
  const { balance, svcWallet } = useContext(WalletContext)
  const { fromCurrency } = useContext(FiatContext)
  const { notifyResult } = useContext(TxResultContext)

  const bankConfig = getBankTransferConfigSync()

  // Asset and network state (matching SendForm layout)
  const [selectedAsset, setSelectedAsset] = useState<AssetSymbol>('BTC')
  const selectedMethod: TransferMethod = sendInfo.method ?? TRANSFER_METHOD.bank

  // Form state
  const [currency, setCurrency] = useState<BankCurrency>(bankSendInfo.currency || bankConfig.defaultCurrency)
  const [circuit, setCircuit] = useState<BankCircuit>(bankSendInfo.circuit || getDefaultCircuit(currency))
  const [amount, setAmount] = useState<number>(bankSendInfo.amount || 0)

  // Bank details form state. SWIFT includes the structured beneficiary
  // address required by IBSettle's international payment rail
  // (see bankTransferConfig.ts::BankDataSwift)
  const [bankFields, setBankFields] = useState<BankDetailsFields>(emptyBankDetailsFields)

  // API state
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  // Validation
  const numAmount = amount
  const validation = useBankTransferValidation({ amount: numAmount, currency, circuit })

  const [availableBalance, setAvailableBalance] = useState(0)
  const { aspInfo } = useContext(AspContext)
  const { t } = useTranslation()


  const smartSetError = (str: string) => {
    setError(str === '' ? (aspInfo.unreachable ? t('errors.send.arkade.server') : '') : str)
  }

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

    // update available balance
  useEffect(() => {
    if (!svcWallet) return
    svcWallet
      .getBalance()
      .then((bal) => setAvailableBalance(bal.available))
      .catch(smartSetError)
  }, [balance])

  // sepa is the only circuit where bank details can be skipped for a
  // KYC-verified customer — ramp-system fills in their IBAN from ID-Flow
  // server-side. swift/us always need the form (BIC/address, or account +
  // routing number, aren't things KYC provides).
  const skipBankDetails = validation.kycVerified && circuit === 'sepa'

  const validateBankDetails = (): BankData | null => {
    const bankData = toBankData(circuit, bankFields)
    if (bankData) return bankData
    switch (circuit) {
      case 'sepa':
        setError(t('errors.send.bank.ibanName'))
        break
      case 'swift':
        setError('Please fill in all SWIFT transfer fields, including your address')
        break
      case 'us':
        setError('Please enter your account holder name, account number, and routing number')
        break
      default:
        setError(t('errors.send.bank.invalidTransfer'))
    }
    return null
  }

  const resumePendingWithdrawal = async (): Promise<boolean> => {
    const pending = await resolvePendingBankWithdrawal()
    if (pending.kind === 'none') return false

    setBankSendInfo({ ...bankSendInfo, order: pending.order })
    setCurrentBankOrderType('send')

    if (pending.kind === 'settled') return false

    if (pending.kind === 'progressed') {
      navigate(Pages.BankOrderStatus)
      return true
    }

    throw new Error(
      pending.fundingState === 'funded'
        ? 'Your withdrawal payment is awaiting confirmation. Please check the order status before starting another withdrawal.'
        : 'Your previous withdrawal payment may still be processing. Please check the order status before trying again.',
    )
  }

  const handleCreateWithdraw = async () => {
    try {
      setLoading(true)
      setError('')
      if (await resumePendingWithdrawal()) return
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.send.bank.failedWithdrawal'))
      return
    } finally {
      setLoading(false)
    }

    if (!validation.canProceed) {
      if (!validation.kycVerified && validation.kycRequired) {
        navigate(Pages.SettingsKYC)
        return
      }
      return
    }

    let bankData: BankData | undefined
    if (!skipBankDetails) {
      const validated = validateBankDetails()
      if (!validated) return
      bankData = validated
    }

    try {
      setLoading(true)
      setError('')

      // Convert fiat amount to satoshis using the live exchange rate
      const requiredSats = fromCurrency(numAmount, currency)

      // Check balance before doing anything
      if (balance < requiredSats) {
        // The message has to be assigned to state — building the string alone
        // left the screen silent, so the button just appeared to do nothing.
        setError(
          t('errors.insufficientBalance', {
            required: prettyNumber(fromSatoshis(requiredSats), 8),
            balance: prettyNumber(fromSatoshis(balance), 8),
          }),
        )
        return
      }

      if (!svcWallet) {
        setError(t('errors.send.wallet.notReady'))
        return
      }

      // Register the withdrawal order with the backend, then fund it
      await fundBankWithdrawal({
        svcWallet,
        signerPubkey: aspInfo.signerPubkey,
        asset: 'BTC',
        currency,
        circuit,
        bankData,
        amountSats: requiredSats,
        email: getUserEmailForBankTransfer(),
        onOrderCreated: (order) => {
          setBankSendInfo({
            currency,
            circuit,
            amount: numAmount,
            bankData,
            order,
          })
          setCurrentBankOrderType('send')
        },
        onFunding: () => setSending(true),
      })

      // Success popup, then land on the order-status screen to track the payout
      notifyResult(true, t('common.notifications.bank.submissionSuccess')).then(() => navigate(Pages.BankOrderStatus))
    } catch (err) {
      if (err instanceof WithdrawalWalletNotConfiguredError) {
        setError(t('errors.send.wallet.notConfigured'))
        return
      }
      setError(err instanceof Error ? err.message : t('errors.send.bank.failedWithdrawal'))
      setSending(false)
      notifyResult(false, t('common.notifications.bank.submissionFailed'))
    } finally {
      setLoading(false)
    }
  }

  const canSubmit =
    validation.canProceed && (skipBankDetails || toBankData(circuit, bankFields) !== null) && !loading && !sending

  if (sending) {
    return (
      <>
        <Header text= {t('common.general.send')} />
        <Content>
          <WaitingForRound />
        </Content>
      </>
    )
  }

  return (
    <>
      <Header
        text=''
        back={goBack}
        auxIcon={<TransactionsIcon />}
        auxFunc={handleOrderHistory}
        auxAriaLabel= {t('common.orderHistory')}
      />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
            <ErrorMessage error={Boolean(error)} text={error} />

            {/* Inline Amount Input with swap functionality */}
            <InlineAmountInput value={amount} onChange={setAmount} asset={selectedAsset} bankCurrency={currency} />

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'center', }}>
                <AssetSelector
                  label=''
                  assets={BANK_TRANSFER_ASSET_LIST}
                  selected={selectedAsset}
                  onSelect={setSelectedAsset}
                  selectedBalance={availableBalance}
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    width: '235px',
                    height: '36px',
                    borderRadius: '2.5rem',
                    fontSize: '14px',
                    fontWeight: '600',
                  }}
                />
              </div>
            <NetworkSelector
              assetSymbol={selectedAsset}
              label=''
              selected={selectedMethod}
              onSelect={(network) => {
                if (network !== TRANSFER_METHOD.bank) {
                  setSendInfo({ ...sendInfo, method: network })
                  navigate(Pages.SendForm)
                }
              }}
              style = {{
                borderRadius : '2.5rem',
              }}
            />

            <FlexCol gap='1rem'>
              {/* Currency Selection */}
              <BankCurrencySelector selectedCurrency={currency} onSelect={setCurrency} currencies={getSupportedSendCurrencies()} />

              {/* Transfer Method */}
              <BankCircuitSelector currency={currency} selectedCircuit={circuit} onSelect={setCircuit} />
            </FlexCol>

            {/* Bank Transfer Terms & Conditions — mirrors BankReceive, and the
                other send methods, which all show them under the selectors */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%' }}>
              <TermsInfo items={TERMS_AND_CONDITIONS.send.bank} />
            </div>

            {/* SWIFT fee notice */}
            {circuit === 'swift' ? <SwiftSendFeeNotice currency={currency} /> : null}

            {/* Bank Details Section - hidden when KYC email bypasses requirement */}
            {!skipBankDetails && (
              <FlexCol gap='1rem'>
                <BankDataForm circuit={circuit} value={bankFields} onChange={setBankFields} />
              </FlexCol>
            )}
            </div>


            {/* Validation and KYC messages */}
            <BankTransferValidationMessages validation={validation} />
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button
          label={loading ? t('common.notifications.bank.creatingOrder') : t('common.notifications.bank.createWithdrawal')}
          onClick={handleCreateWithdraw}
          icon = {<img src = {rightIcon} alt = 'rightArrow' style = {{width: '16px', height: '16px', filter: 'brightness(0) invert(1)', marginLeft: '0.5rem'}} />}
          disabled={!canSubmit}
          loading={loading}
          style = {{ margin: '4px 0', fontFamily: 'Titillium Web', fontStyle:'semibold', fontWeight : 600, width: '100%', height: '48px', borderRadius: '16px',}}
        />
      </ButtonsOnBottom>
    </>
  )
}
