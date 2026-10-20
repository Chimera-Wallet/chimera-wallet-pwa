/**
 * POS payout setup: choose the payout currency, then
 * - BTC: nothing to configure, payments land in the wallet as-is;
 * - EUR / CHF: the KYC-free conversion limit, then the bank account that
 *   payouts go to (same fields and disclaimer as the bank withdraw screen).
 *
 * Used for onboarding and, from POS settings, to change the payout currency or
 * account. Fiat is only saved together with a complete bank account.
 */

import { useContext, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '../../../components/Button'
import WalletIcon from '../../../icons/Wallet'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import Content from '../../../components/Content'
import FlexCol from '../../../components/FlexCol'
import Header from '../../../components/Header'
import Padded from '../../../components/Padded'
import Text, { TextSecondary } from '../../../components/Text'
import TermsInfo from '../../../components/TermsInfo'
import { BankCircuitSelector, BankDataForm, SwiftSendFeeNotice } from '../../../components/BankDetails'
import { useBankTransferValidation } from '../../../hooks/useBankTransferValidation'
import {
  getBankTransferConfigSync,
  getDefaultCircuit,
  getSupportedCircuits,
  toBankData,
  toBankDetailsFields,
  type BankCircuit,
  type BankDetailsFields,
} from '../../../lib/bankTransferConfig'
import {
  getPosSettings,
  isFiatPayout,
  setBtcPayout,
  setFiatPayout,
  type PosFiatPayoutCurrency,
  type PosPayoutCurrency,
} from '../../../lib/pos'
import { TERMS_AND_CONDITIONS } from '../../../lib/transferMethods'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { CurrencyLogo, PosRow, payoutCurrencyName } from './shared'

type Step = 'currency' | 'btc' | 'kyc' | 'bank'

// Order as in the design: Bitcoin, Swiss Franc, Euro
const PAYOUT_OPTIONS: PosPayoutCurrency[] = ['BTC', 'CHF', 'EUR']

interface PayoutSetupProps {
  onBack: () => void
  /** Called once the choice has been saved. */
  onDone: () => void
  /** Open straight on the bank account step, to edit the saved account. */
  editBank?: boolean
}

export default function PayoutSetup({ onBack, onDone, editBank = false }: PayoutSetupProps) {
  const { t } = useTranslation()
  const { navigate } = useContext(NavigationContext)

  const saved = useMemo(getPosSettings, [])
  const initialStep: Step = editBank ? 'bank' : 'currency'
  const [step, setStep] = useState<Step>(initialStep)
  const [currency, setCurrency] = useState<PosFiatPayoutCurrency>(
    isFiatPayout(saved.payoutCurrency) ? saved.payoutCurrency : 'EUR',
  )
  const [circuit, setCircuit] = useState<BankCircuit>(() =>
    saved.circuit && getSupportedCircuits(currency).includes(saved.circuit) ? saved.circuit : getDefaultCircuit(currency),
  )
  const [fields, setFields] = useState<BankDetailsFields>(() => toBankDetailsFields(saved.bankData))
  const bankData = toBankData(circuit, fields)

  // Only the KYC step shows the verification status, so only it asks for it
  const { kycVerified, kycThreshold } = useBankTransferValidation({ amount: 0, currency, circuit, enabled: step === 'kyc' })

  const chooseCurrency = (choice: PosPayoutCurrency) => {
    if (!isFiatPayout(choice)) return setStep('btc')
    setCurrency(choice)
    if (!getSupportedCircuits(choice).includes(circuit)) setCircuit(getDefaultCircuit(choice))
    setStep('kyc')
  }

  const handleBack = () => {
    if (step === initialStep) return onBack()
    setStep(step === 'bank' ? 'kyc' : 'currency')
  }

  const saveBtc = () => {
    setBtcPayout()
    onDone()
  }

  const saveBank = () => {
    if (!bankData) return
    setFiatPayout(currency, circuit, bankData)
    onDone()
  }

  const header = <Header text={t('apps.pos.title')} back={handleBack} />

  if (step === 'currency') {
    return (
      <>
        {header}
        <Content>
          <Padded>
            <FlexCol gap='1.5rem'>
              <FlexCol centered gap='0.5rem'>
                <WalletIcon />
                <Text big centered bold>
                  {t('apps.pos.payout.title')}
                </Text>
                <TextSecondary centered>{t('apps.pos.payout.subtitle')}</TextSecondary>
              </FlexCol>
              <FlexCol gap='0.75rem'>
                {PAYOUT_OPTIONS.map((option) => (
                  <PosRow
                    key={option}
                    testId={`pos-payout-${option}`}
                    icon={<CurrencyLogo currency={option} />}
                    label={t(payoutCurrencyName(option))}
                    onClick={() => chooseCurrency(option)}
                  />
                ))}
              </FlexCol>
            </FlexCol>
          </Padded>
        </Content>
      </>
    )
  }

  if (step === 'btc') {
    return (
      <>
        {header}
        <Content>
          <Padded>
            <FlexCol centered gap='1rem'>
              <CurrencyLogo currency='BTC' size={72} />
              <Text big centered bold>
                {t('apps.pos.payout.btcDoneTitle')}
              </Text>
              <Text centered wrap>
                {t('apps.pos.payout.btcDone')}
              </Text>
            </FlexCol>
          </Padded>
        </Content>
        <ButtonsOnBottom>
          <Button label={t('common.general.continue')} onClick={saveBtc} testId='pos-payout-btc-continue' />
        </ButtonsOnBottom>
      </>
    )
  }

  if (step === 'kyc') {
    return (
      <>
        {header}
        <Content>
          <Padded>
            <FlexCol centered gap='1rem'>
              <CurrencyLogo currency={currency} size={72} />
              <Text big centered bold>
                {t('apps.pos.payout.kycTitle')}
              </Text>
              <Text centered wrap>
                {kycVerified
                  ? t('apps.pos.payout.verified')
                  : t('apps.pos.payout.kycText', { limit: kycThreshold.toLocaleString(), currency })}
              </Text>
            </FlexCol>
          </Padded>
        </Content>
        <ButtonsOnBottom>
          <Button label={t('common.general.continue')} onClick={() => setStep('bank')} testId='pos-payout-kyc-continue' />
          {kycVerified ? null : (
            <Button label={t('apps.pos.payout.verify')} onClick={() => navigate(Pages.SettingsKYC)} secondary />
          )}
        </ButtonsOnBottom>
      </>
    )
  }

  return (
    <>
      {header}
      <Content>
        <Padded>
          <FlexCol gap='1rem'>
            <FlexCol gap='0.25rem'>
              <Text bold>{t('apps.pos.payout.bankTitle')}</Text>
              <TextSecondary>
                {t('apps.pos.payout.bankText', { currency: getBankTransferConfigSync().currencyLabels[currency] })}
              </TextSecondary>
            </FlexCol>
            <BankCircuitSelector currency={currency} selectedCircuit={circuit} onSelect={setCircuit} />
            <BankDataForm circuit={circuit} value={fields} onChange={setFields} />
            {circuit === 'swift' ? <SwiftSendFeeNotice currency={currency} /> : null}
            <TermsInfo items={TERMS_AND_CONDITIONS.send.bank} />
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button
          label={t('apps.pos.payout.save')}
          onClick={saveBank}
          disabled={!bankData}
          testId='pos-payout-save'
        />
      </ButtonsOnBottom>
    </>
  )
}
