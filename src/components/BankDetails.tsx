/**
 * Bank Details Components
 *
 * Shared UI components for displaying and collecting bank transfer details.
 * Used by both Bank Receive (deposit) and Bank Send (withdraw) flows.
 */

import { ReactNode, useState } from 'react'
import Shadow from './Shadow'
import FlexCol from './FlexCol'
import FlexRow from './FlexRow'
import Text, { TextSecondary } from './Text'
import CopyIcon from '../icons/Copy'
import CheckMarkIcon from '../icons/CheckMark'
import { copyToClipboard } from '../lib/clipboard'
import {
  type BankCircuit,
  type BankCurrency,
  getBankTransferConfigSync,
  getSupportedCircuits,
} from '../lib/bankTransferConfig'
import SelectSheet from './SelectSheet'
import { useTranslation } from 'react-i18next'

// ============================================
// Copy Button (reusable)
// ============================================

interface CopyButtonProps {
  value: string
}

export function CopyButton({ value }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await copyToClipboard(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div onClick={handleCopy} style={{ cursor: 'pointer', flexShrink: 0 }}>
      {copied ? <CheckMarkIcon small /> : <CopyIcon />}
    </div>
  )
}

// ============================================
// Bank Field Box (single field display)
// ============================================

interface BankFieldBoxProps {
  label: string
  value: string
  copyable?: boolean
  required?: boolean
  multiline?: boolean
}

export function BankFieldBox({
  label,
  value,
  copyable = false,
  required = false,
  multiline = false,
}: BankFieldBoxProps) {
  if (!value) return null
  const {t} = useTranslation()
  return (
    <Shadow fat>
      <FlexCol gap='0.25rem'>
        <FlexRow between>
          <TextSecondary>{label}</TextSecondary>
          {required ? (
            <Text small color='orange' bold>
              {t('components.bankDet.req')}
            </Text>
          ) : null}
        </FlexRow>
        <FlexRow between gap='0.5rem'>
          <div
            style={{
              wordBreak: multiline ? 'break-word' : undefined,
              flex: 1,
              color: 'var(--white)',
            }}
          >
            {value}
          </div>
          {copyable ? <CopyButton value={value} /> : null}
        </FlexRow>
      </FlexCol>
    </Shadow>
  )
}

// ============================================
// SEPA Data View
// ============================================

interface SepaDataViewProps {
  iban?: string
  bic?: string
  beneficiary?: string
  bankName?: string
}

export function SepaDataView({ iban, bic, beneficiary, bankName }: SepaDataViewProps) {
  const {t} = useTranslation()
  return (
    <FlexCol gap='0.75rem'>
      <BankFieldBox label={t('components.bankDet.iban')} value={iban ?? ''} copyable />
      <BankFieldBox label={t('components.bankDet.bicSwift')} value={bic ?? ''} copyable />
      <BankFieldBox label={t('components.bankDet.benef')} value={beneficiary ?? ''} />
      <BankFieldBox label={t('components.bankDet.name')} value={bankName ?? ''} />
    </FlexCol>
  )
}

// ============================================
// SWIFT Data View
// ============================================

interface SwiftDataViewProps {
  iban?: string
  bic?: string
  beneficiary?: string
  bankName?: string
}

export function SwiftDataView({
  iban,
  bic,
  beneficiary,
  bankName,
}: SwiftDataViewProps) {
  const {t} = useTranslation()
  return (
    <FlexCol gap='0.75rem'>
      <BankFieldBox label={t('components.bankDet.iban')} value={iban ?? ''} copyable />
      <BankFieldBox label={t('components.bankDet.bicSwift')} value={bic ?? ''} copyable />
      <BankFieldBox label={t('components.bankDet.benef')} value={beneficiary ?? ''} />
      <BankFieldBox label={t('components.bankDet.name')} value={bankName ?? ''} />
    </FlexCol>
  )
}

// ============================================
// US Wire Data View
// ============================================

interface UsWireDataViewProps {
  accountNumber?: string
  routingNumber?: string
  beneficiary?: string
  beneficiaryAddress?: string
  bankName?: string
  bankAddress?: string
}

export function UsWireDataView({
  accountNumber,
  routingNumber,
  beneficiary,
  beneficiaryAddress,
  bankName,
  bankAddress,
}: UsWireDataViewProps) {
  const {t} = useTranslation()
  return (
    <FlexCol gap='0.75rem'>
      <BankFieldBox label={t('components.bankDet.accNum')} value={accountNumber ?? ''} copyable />
      <BankFieldBox label={t('components.bankDet.routeNum')} value={routingNumber ?? ''} copyable />
      <BankFieldBox label={t('components.bankDet.benef')} value={beneficiary ?? ''} />
      <BankFieldBox label={t('components.bankDet.benefAdd')} value={beneficiaryAddress ?? ''} multiline />
      <BankFieldBox label={t('components.bankDet.name')} value={bankName ?? ''} />
      <BankFieldBox label={t('components.bankDet.bankAdd')} value={bankAddress ?? ''} multiline />
    </FlexCol>
  )
}

// ============================================
// Transfer Reference Box
// ============================================

interface TransferReferenceBoxProps {
  reference: string
}

export function TransferReferenceBox({ reference }: TransferReferenceBoxProps) {
  if (!reference) return null
  const {t} = useTranslation()
  return ( 
    <Shadow fat border>
      <FlexCol gap='0.5rem'>
        <FlexRow between>
          <Text bold color='orange'>
            {t('components.bankDet.refCode')}
          </Text>
          <CopyButton value={reference} />
        </FlexRow>
        <div style={{ fontFamily: 'Titillium Web', fontSize: '1.1rem', color: 'var(--white)' }}>{reference}</div>
        <TextSecondary>
          {t('components.bankDet.mustIncl')}
        </TextSecondary>
      </FlexCol>
    </Shadow>
  )
}

// ============================================
// Bank Circuit Selector
// ============================================

interface BankCircuitSelectorProps {
  currency: BankCurrency
  selectedCircuit: BankCircuit
  onSelect: (circuit: BankCircuit) => void
}

export function BankCircuitSelector({ currency, selectedCircuit, onSelect }: BankCircuitSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const config = getBankTransferConfigSync()
  const circuits = getSupportedCircuits(currency)

  if (circuits.length <= 1) {
    // Only one option, no need for selector
    return (
      <Shadow input>
        <Text>{config.circuitLabels[selectedCircuit]}</Text>
      </Shadow>
    )
  }
  const {t} = useTranslation()

  return (
    <>
      <Shadow input onClick={() => setIsOpen(true)}>
        <FlexRow between>
          <Text>{config.circuitLabels[selectedCircuit]}</Text>
          <TextSecondary>{t('components.bankDet.change')}</TextSecondary>
        </FlexRow>
      </Shadow>
      <SelectSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSelect={(id) => onSelect(id as BankCircuit)}
        options={circuits.map((circuit) => ({
          id: circuit,
          label: config.circuitLabels[circuit],
        }))}
        selected={selectedCircuit}
        title={t('components.bankDet.selTrans')}
      />
    </>
  )
}

// ============================================
// Bank Currency Selector
// ============================================

interface BankCurrencySelectorProps {
  selectedCurrency: BankCurrency
  onSelect: (currency: BankCurrency) => void
  /** Explicit list of currencies to show. Defaults to all supported currencies. */
  currencies?: BankCurrency[]
}

export function BankCurrencySelector({ selectedCurrency, onSelect, currencies }: BankCurrencySelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const config = getBankTransferConfigSync()
  const availableCurrencies = currencies ?? config.supportedReceiveCurrencies

  if (availableCurrencies.length <= 1) {
    // Only one option, no need for selector
    return (
      <Shadow input>
        <Text>{config.currencyLabels[selectedCurrency]}</Text>
      </Shadow>
    )
  }
  const {t} = useTranslation()

  return (
    <>
      <Shadow input onClick={() => setIsOpen(true)}>
        <FlexRow between>
          <Text>{config.currencyLabels[selectedCurrency]}</Text>
          <TextSecondary>{t('components.bankDet.change')}</TextSecondary>
        </FlexRow>
      </Shadow>
      <SelectSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSelect={(id) => onSelect(id as BankCurrency)}
        options={availableCurrencies.map((currency) => ({
          id: currency,
          label: config.currencyLabels[currency],
        }))}
        selected={selectedCurrency}
        title={t('components.bankDet.selCurr')}
      />
    </>
  )
}

// ============================================
// Bank Details Section Header
// ============================================

interface BankDetailsSectionProps {
  title: string
  children: ReactNode
}

export function BankDetailsSection({ title, children }: BankDetailsSectionProps) {
  return (
    <FlexCol gap='0.75rem'>
      <Text bold>{title}</Text>
      {children}
    </FlexCol>
  )
}
