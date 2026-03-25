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

export function BankFieldBox({ label, value, copyable = false, required = false, multiline = false }: BankFieldBoxProps) {
  if (!value) return null

  return (
    <Shadow fat>
      <FlexCol gap='0.25rem'>
        <FlexRow between>
          <TextSecondary>{label}</TextSecondary>
          {required ? (
            <Text small color='orange' bold>
              Required
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
  beneficiaryAddress?: string
  bankName?: string
  bankAddress?: string
}

export function SepaDataView({
  iban,
  bic,
  beneficiary,
  beneficiaryAddress,
  bankName,
  bankAddress,
}: SepaDataViewProps) {
  return (
    <FlexCol gap='0.75rem'>
      <BankFieldBox label='IBAN' value={iban ?? ''} copyable />
      <BankFieldBox label='BIC / SWIFT Code' value={bic ?? ''} copyable />
      <BankFieldBox label='Beneficiary' value={beneficiary ?? ''} />
      <BankFieldBox label='Beneficiary Address' value={beneficiaryAddress ?? ''} multiline />
      <BankFieldBox label='Bank Name' value={bankName ?? ''} />
      <BankFieldBox label='Bank Address' value={bankAddress ?? ''} multiline />
    </FlexCol>
  )
}

// ============================================
// SWIFT Data View
// ============================================

interface SwiftDataViewProps {
  iban?: string
  bic?: string
  intermediaryBic?: string
  beneficiary?: string
  beneficiaryAddress?: string
  bankName?: string
  bankAddress?: string
}

export function SwiftDataView({
  iban,
  bic,
  intermediaryBic,
  beneficiary,
  beneficiaryAddress,
  bankName,
  bankAddress,
}: SwiftDataViewProps) {
  return (
    <FlexCol gap='0.75rem'>
      <BankFieldBox label='IBAN' value={iban ?? ''} copyable />
      <BankFieldBox label='BIC / SWIFT Code' value={bic ?? ''} copyable />
      {intermediaryBic ? (
        <BankFieldBox label='Intermediary BIC' value={intermediaryBic} copyable />
      ) : null}
      <BankFieldBox label='Beneficiary' value={beneficiary ?? ''} />
      <BankFieldBox label='Beneficiary Address' value={beneficiaryAddress ?? ''} multiline />
      <BankFieldBox label='Bank Name' value={bankName ?? ''} />
      <BankFieldBox label='Bank Address' value={bankAddress ?? ''} multiline />
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
  return (
    <FlexCol gap='0.75rem'>
      <BankFieldBox label='Account Number' value={accountNumber ?? ''} copyable />
      <BankFieldBox label='Routing Number' value={routingNumber ?? ''} copyable />
      <BankFieldBox label='Beneficiary' value={beneficiary ?? ''} />
      <BankFieldBox label='Beneficiary Address' value={beneficiaryAddress ?? ''} multiline />
      <BankFieldBox label='Bank Name' value={bankName ?? ''} />
      <BankFieldBox label='Bank Address' value={bankAddress ?? ''} multiline />
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

  return (
    <Shadow fat border>
      <FlexCol gap='0.5rem'>
        <FlexRow between>
          <Text bold color='orange'>
            Reference Code (Required)
          </Text>
          <CopyButton value={reference} />
        </FlexRow>
        <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', color: 'var(--white)' }}>
          {reference}
        </div>
        <TextSecondary>
          You MUST include this reference in your bank transfer description for it to be processed
          correctly.
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

  return (
    <>
      <Shadow input onClick={() => setIsOpen(true)}>
        <FlexRow between>
          <Text>{config.circuitLabels[selectedCircuit]}</Text>
          <TextSecondary>Change</TextSecondary>
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
        title='Select Transfer Method'
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
}

export function BankCurrencySelector({ selectedCurrency, onSelect }: BankCurrencySelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const config = getBankTransferConfigSync()

  if (config.supportedCurrencies.length <= 1) {
    // Only one option, no need for selector
    return (
      <Shadow input>
        <Text>{config.currencyLabels[selectedCurrency]}</Text>
      </Shadow>
    )
  }

  return (
    <>
      <Shadow input onClick={() => setIsOpen(true)}>
        <FlexRow between>
          <Text>{config.currencyLabels[selectedCurrency]}</Text>
          <TextSecondary>Change</TextSecondary>
        </FlexRow>
      </Shadow>
      <SelectSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSelect={(id) => onSelect(id as BankCurrency)}
        options={config.supportedCurrencies.map((currency) => ({
          id: currency,
          label: config.currencyLabels[currency],
        }))}
        selected={selectedCurrency}
        title='Select Currency'
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
