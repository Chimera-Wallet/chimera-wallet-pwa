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
import WaitingForRound from '../../../components/WaitingForRound'
import { type AssetSymbol } from '../../../lib/assets'
import { TRANSFER_METHOD, type TransferMethod } from '../../../lib/transferMethods'
import TransactionsIcon from '../../../icons/Transactions'
import { BankCircuitSelector, BankCurrencySelector } from '../../../components/BankDetails'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { FlowContext } from '../../../providers/flow'
import { WalletContext } from '../../../providers/wallet'
import { FiatContext } from '../../../providers/fiat'
import { TxResultContext } from '../../../providers/txResult'
import { sendOffChain } from '../../../lib/asp'
import { prettyNumber, fromSatoshis } from '../../../lib/format'
import { createBankWithdraw } from '../../../providers/chimera'
import { addOrderToHistory } from '../../../lib/bankOrderHistory'
import { useBankTransferValidation } from '../../../hooks/useBankTransferValidation'
import {
  getBankTransferConfigSync,
  getDefaultCircuit,
  getSupportedCircuits,
  getSupportedSendCurrencies,
  SWIFT_SEND_FEE,
  type BankCircuit,
  type BankCurrency,
  type BankData,
} from '../../../lib/bankTransferConfig'
import { getUserEmailForBankTransfer } from '../../../lib/kyc'
import { AspContext } from '@/providers/asp'
import rightIcon from '../../../../public/images/icons/ Right.png'
import infoIcon from '../../../../public/images/icons/IconInfoIcon.png'
import {useTranslation} from 'react-i18next'


// Company Ark wallet address from environment — set VITE_BANK_WITHDRAW_WALLET in .env files
const COMPANY_WALLET = import.meta.env.VITE_BANK_WITHDRAW_WALLET as string

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

  // Bank details form state
  const [iban, setIban] = useState<string>('')
  const [bic, setBic] = useState<string>('')
  const [accountHolderName, setAccountHolderName] = useState<string>('')
  const [accountNumber, setAccountNumber] = useState<string>('')
  const [routingNumber, setRoutingNumber] = useState<string>('')

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

  const validateBankDetails = (): BankData | null => {
    switch (circuit) {
      case 'sepa':
        if (!iban || !accountHolderName) {
          setError(t('errors.send.bank.ibanName'))
          return null
        }
        return {
          circuit: 'sepa',
          destinationBankAddress: iban,
          accountHolderName,
        }

      case 'swift':
        if (!bic || !accountHolderName || !accountNumber) {
          setError(t('errors.send.bank.bicSwift'))
          return null
        }
        return {
          circuit: 'swift',
          bic,
          accountHolderName,
          accountNumber,
        }

      case 'us':
        if (!accountNumber || !routingNumber) {
          setError(t('errors.send.bank.accountRouting'))
          return null
        }
        return {
          circuit: 'us',
          accountNumber,
          routingNumber,
        }

      default:
        setError(t('errors.send.bank.invalidTransfer'))
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

      // Convert fiat amount to satoshis using the live exchange rate
      const requiredSats = fromCurrency(numAmount, currency)

      // Check balance before doing anything
      if (balance < requiredSats) {
        t('errors.insufficientBalance', {
          required: prettyNumber(fromSatoshis(requiredSats), 8),
          balance: prettyNumber(fromSatoshis(balance), 8),
        });
        return
      }

      if (!svcWallet) {
        setError(t('errors.send.wallet.notReady'))
        return
      }

      if (!COMPANY_WALLET) {
        setError(t('errors.send.wallet.notConfigured'))
        return
      }

      // Register the withdrawal order with the backend
      const response = await createBankWithdraw({
        email: getUserEmailForBankTransfer(),
        fromAmount: requiredSats,
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
        setCurrentBankOrderType('send')
        addOrderToHistory(response.order, 'send')

        // Send BTC-ARK to the company wallet to fund the withdrawal
        const companyWallet = COMPANY_WALLET
        setSending(true)
        await sendOffChain(svcWallet, requiredSats, companyWallet)

        // Success popup, then land on the order-status screen to track the payout
        notifyResult(true, t('common.notifications.bank.submissionSuccess')).then(() => navigate(Pages.BankOrderStatus))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.send.bank.failedWithdrawal'))
      setSending(false)
      notifyResult(false, t('common.notifications.bank.submissionFailed'))
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
              <Shadow input>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <Text tiny color='neutral-500'>
                    IBAN
                  </Text>
         
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
              </div>
              </Shadow>
            </FlexCol>
            <FlexCol gap='0.5rem'>
              <Shadow input>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <Text tiny color='neutral-500'>
                    {t('common.accountName')}
                  </Text>
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
                </div>
              </Shadow>
            </FlexCol>
          </>
        )

      case 'swift':
        return (
          <>
            <FlexCol gap='0.5rem'>
              <Shadow input>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <Text tiny color='neutral-500'>
                    BIC/SWIFT
                  </Text>
                <input
                  type='text'
                  value={bic}
                  onChange={(e) => setBic(e.target.value.toUpperCase())}
                  placeholder='DEUTDEDB'
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--white)',
                    fontSize: '1rem',
                    outline: 'none',
                  }}
                />
                </div>
              </Shadow>
            </FlexCol>
            <FlexCol gap='0.5rem'>
              <Shadow input>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <Text tiny color='neutral-500'>
                    {t('common.accountName')}
                  </Text>
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
                </div>
              </Shadow>
            </FlexCol>
            <FlexCol gap='0.5rem'>
              <Shadow input>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <Text tiny color='neutral-500'>
                    {t('common.accountNumber')}
                  </Text>
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
                </div>
              </Shadow>
            </FlexCol>
          </>
        )

      case 'us':
        return (
          <>
            <FlexCol gap='0.5rem'>
              <Shadow input>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <Text tiny color='neutral-500'>
                    {t('common.accountNumber')}
                  </Text>
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
                </div>
              </Shadow>
            </FlexCol>
            <FlexCol gap='0.5rem'>
              <Shadow input>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <Text tiny color='neutral-500'>
                    {t('common.routingNumber')}
                  </Text>
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
                </div>
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
        return Boolean(bic && accountHolderName && accountNumber)
      case 'us':
        return Boolean(accountNumber && routingNumber)
      default:
        return false
    }
  }

  // When KYC email is present, bank details are not needed regardless of amount
  const skipBankDetails = validation.kycVerified
  const canSubmit = validation.canProceed && (skipBankDetails || isBankDetailsComplete()) && !loading && !sending

  if (sending) {
    return (
      <>
        <Header text='Send' />
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
            {/* SWIFT fee notice */}
            {circuit === 'swift' ? (
              <Info color='orange' icon = {<img src = {infoIcon} alt = 'info' style = {{width: '16px', height: '16px', filter: 'brightness(0) invert(0.7)'}} />} title={`SWIFT Transfer Fee: ${SWIFT_SEND_FEE} ${currency}`}>
                <TextSecondary>
                  {t('common.notifications.bank.swiftFee', {
                    fee: SWIFT_SEND_FEE,
                    currency,
                  })}
                </TextSecondary>
              </Info>
            ) : null}

            {/* Bank Details Section - hidden when KYC email bypasses requirement */}
            {!skipBankDetails && (
              <FlexCol gap='1rem'>
                {renderBankInputs()}
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
