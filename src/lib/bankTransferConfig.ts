/**
 * Bank Transfer Configuration Service
 *
 * Provides configuration for bank transfers including supported currencies,
 * validation thresholds, and available circuits.
 *
 * Currently uses hardcoded defaults, but structured for future backend integration.
 * When ready to integrate with backend, replace fetchBankTransferConfig() implementation.
 */

import { FIATS, type FiatSymbol } from './fiatConfig'

// Bank circuit types for different transfer methods
export const BANK_CIRCUITS = ['sepa', 'swift', 'us'] as const
export type BankCircuit = (typeof BANK_CIRCUITS)[number]

// Re-export FiatSymbol as BankCurrency — FIATS in fiatConfig.ts is the single source of truth
export type BankCurrency = FiatSymbol

// Bank data interfaces for withdrawals
export interface BankDataSepa {
  circuit: 'sepa'
  destinationBankAddress: string // IBAN
  accountHolderName: string
}

export interface BankDataSwift {
  circuit: 'swift'
  destinationBankAddress: string // IBAN
  bic: string // BIC/SWIFT code
  accountHolderName: string
  // Structured beneficiary address — IBSettle's international payment rail
  // requires these as discrete fields, not one free-text address.
  country: string // ISO 3166-1 alpha-2
  streetName: string
  buildingNumber: string
  townName: string
  postCode: string
}

export interface BankDataUs {
  circuit: 'us'
  accountNumber: string
  routingNumber: string
  accountHolderName: string
}

export type BankData = BankDataSepa | BankDataSwift | BankDataUs

/**
 * Flat, editable form state behind a BankData — every field any circuit may
 * need, so switching circuit in a form keeps what the user already typed.
 */
export interface BankDetailsFields {
  iban: string
  bic: string
  accountHolderName: string
  accountNumber: string
  routingNumber: string
  country: string
  streetName: string
  buildingNumber: string
  townName: string
  postCode: string
}

export const emptyBankDetailsFields: BankDetailsFields = {
  iban: '',
  bic: '',
  accountHolderName: '',
  accountNumber: '',
  routingNumber: '',
  country: '',
  streetName: '',
  buildingNumber: '',
  townName: '',
  postCode: '',
}

export interface BankFieldSpec {
  key: keyof BankDetailsFields
  /** An i18n key, or a label shown as-is (t() returns unknown keys unchanged). */
  label: string
  placeholder: string
  uppercase?: boolean
}

const IBAN: BankFieldSpec = { key: 'iban', label: 'IBAN', placeholder: 'DE89 3704 0044 0532 0130 00', uppercase: true }
const HOLDER: BankFieldSpec = { key: 'accountHolderName', label: 'common.accountName', placeholder: 'John Doe' }

/**
 * The fields each circuit requires, in form order. Single source for
 * validation (toBankData) and the entry form (components/BankDetails::BankDataForm).
 */
export const BANK_FIELDS: Record<BankCircuit, BankFieldSpec[]> = {
  sepa: [IBAN, HOLDER],
  // SWIFT needs the structured beneficiary address IBSettle requires (BankDataSwift)
  swift: [
    IBAN,
    { key: 'bic', label: 'BIC/SWIFT', placeholder: 'DEUTDEFF', uppercase: true },
    HOLDER,
    { key: 'country', label: 'Country (ISO code)', placeholder: 'DE', uppercase: true },
    { key: 'streetName', label: 'Street Name', placeholder: 'Musterstrasse' },
    { key: 'buildingNumber', label: 'Building Number', placeholder: '1' },
    { key: 'townName', label: 'Town', placeholder: 'Frankfurt' },
    { key: 'postCode', label: 'Postal Code', placeholder: '60306' },
  ],
  us: [
    HOLDER,
    { key: 'accountNumber', label: 'common.accountNumber', placeholder: '123456789' },
    { key: 'routingNumber', label: 'common.routingNumber', placeholder: '021000021' },
  ],
}

// The form calls the IBAN `iban`; BankData calls it `destinationBankAddress`
const toDataKey = (key: keyof BankDetailsFields) => (key === 'iban' ? 'destinationBankAddress' : key)

/** Build the BankData for `circuit`, or null when a required field is missing. */
export const toBankData = (circuit: BankCircuit, fields: BankDetailsFields): BankData | null => {
  const specs = BANK_FIELDS[circuit]
  if (!specs || !specs.every(({ key }) => fields[key])) return null
  return { circuit, ...Object.fromEntries(specs.map(({ key }) => [toDataKey(key), fields[key]])) } as BankData
}

/** Inverse of toBankData — to prefill a form from saved details. */
export const toBankDetailsFields = (data?: BankData): BankDetailsFields => {
  if (!data) return { ...emptyBankDetailsFields }
  const filled = BANK_FIELDS[data.circuit].map(({ key }) => [key, (data as unknown as Record<string, string>)[toDataKey(key)]])
  return { ...emptyBankDetailsFields, ...Object.fromEntries(filled) }
}

/** Short, masked label for a saved account, e.g. "CH93 •••• 2957". */
export const maskBankAccount = (data?: BankData): string => {
  if (!data) return ''
  const raw = (data.circuit === 'us' ? data.accountNumber : data.destinationBankAddress).replace(/\s+/g, '')
  if (raw.length <= 8) return raw
  return `${raw.slice(0, 4)} •••• ${raw.slice(-4)}`
}

/**
 * Configuration interface for bank transfers
 * Structured to support future backend integration
 */
export interface BankTransferConfig {
  /** List of currencies supported for receiving (deposit) */
  supportedReceiveCurrencies: BankCurrency[]
  /** List of currencies supported for sending (withdrawal) */
  supportedSendCurrencies: BankCurrency[]
  /** Minimum order value in the selected currency (e.g., 15 EUR) */
  minimumOrderValue: number
  /** Threshold above which KYC verification is required (e.g., 1000 EUR) */
  kycThreshold: number
  /** Default currency to use when none selected */
  defaultCurrency: BankCurrency
  /** Available bank circuits per currency */
  circuitsPerCurrency: Record<BankCurrency, BankCircuit[]>
  /** Human-readable labels for circuits */
  circuitLabels: Record<BankCircuit, string>
  /** Human-readable labels for currencies */
  currencyLabels: Record<BankCurrency, string>
}

/**
 * Default hardcoded configuration
 * Will be replaced by backend response in future
 */
const DEFAULT_CONFIG: BankTransferConfig = {
  // Receive (deposit): SEPA and SWIFT, EUR only
  supportedReceiveCurrencies: [FIATS.EUR.symbol],
  // Send (withdrawal): SWIFT for EUR/CHF/USD; SEPA for EUR; US Wire for USD
  supportedSendCurrencies: [FIATS.EUR.symbol, FIATS.CHF.symbol, FIATS.USD.symbol],
  minimumOrderValue: 15,
  kycThreshold: 1000,
  defaultCurrency: FIATS.EUR.symbol,
  circuitsPerCurrency: {
    EUR: ['sepa', 'swift'],
    CHF: ['swift'],
    USD: ['swift'],
    JPY: [],
    GBP: [],
    CNY: [],
  },
  circuitLabels: {
    sepa: 'SEPA Transfer',
    swift: 'SWIFT Transfer',
    us: 'US Wire Transfer',
  },
  // Derived from FIATS so names stay consistent with fiatConfig.ts
  currencyLabels: Object.fromEntries(
    Object.values(FIATS).map((f) => [f.symbol, `${f.name} (${f.symbol})`]),
  ) as Record<BankCurrency, string>,
}

// Cached configuration
let cachedConfig: BankTransferConfig | null = null

/**
 * Fetch bank transfer configuration
 *
 * Currently returns hardcoded defaults.
 * Future implementation will fetch from backend API.
 *
 * @returns Promise resolving to BankTransferConfig
 */
export const fetchBankTransferConfig = async (): Promise<BankTransferConfig> => {
  // TODO: Replace with actual API call when backend is ready
  // const response = await fetch(`${getBaseUrl()}/config/bank-transfer/`)
  // return response.json()

  // Simulate network delay for future-proofing
  return Promise.resolve(DEFAULT_CONFIG)
}

/**
 * Get bank transfer configuration (with caching)
 *
 * @param forceRefresh - Force fetch fresh config from source
 * @returns Promise resolving to BankTransferConfig
 */
export const getBankTransferConfig = async (forceRefresh = false): Promise<BankTransferConfig> => {
  if (!cachedConfig || forceRefresh) {
    cachedConfig = await fetchBankTransferConfig()
  }
  return cachedConfig
}

/**
 * Get bank transfer configuration synchronously
 * Returns cached config or defaults if not yet fetched
 *
 * @returns BankTransferConfig
 */
export const getBankTransferConfigSync = (): BankTransferConfig => {
  return cachedConfig ?? DEFAULT_CONFIG
}

/**
 * Get supported circuits for a given currency
 *
 * @param currency - The currency to get circuits for
 * @returns Array of supported BankCircuit types
 */
export const getSupportedCircuits = (currency: BankCurrency): BankCircuit[] => {
  const config = getBankTransferConfigSync()
  return config.circuitsPerCurrency[currency] ?? []
}

/**
 * Get the default circuit for a currency
 *
 * @param currency - The currency to get default circuit for
 * @returns The first supported circuit or 'sepa' as fallback
 */
export const getDefaultCircuit = (currency: BankCurrency): BankCircuit => {
  const circuits = getSupportedCircuits(currency)
  return circuits[0] ?? 'sepa'
}

/**
 * Get currencies supported for receiving (deposit)
 */
export const getSupportedReceiveCurrencies = (): BankCurrency[] => {
  return getBankTransferConfigSync().supportedReceiveCurrencies
}

/**
 * Get currencies supported for sending (withdrawal)
 */
export const getSupportedSendCurrencies = (): BankCurrency[] => {
  return getBankTransferConfigSync().supportedSendCurrencies
}

/** Convenience constant for the default bank transfer currency */
export const DEFAULT_BANK_CURRENCY: BankCurrency = DEFAULT_CONFIG.defaultCurrency

/** Convenience constant for the default bank transfer circuit */
export const DEFAULT_BANK_CIRCUIT: BankCircuit = DEFAULT_CONFIG.circuitsPerCurrency[DEFAULT_CONFIG.defaultCurrency][0]

/** Fixed SWIFT fee charged to the sender on incoming (receive/deposit) transfers */
export const SWIFT_RECEIVE_FEE = 30

/** Fixed SWIFT fee charged on outgoing (send/withdrawal) transfers */
export const SWIFT_SEND_FEE = 50

/** Fixed minimum amount for SWIFT transfers (in selected currency) */
export const SWIFT_MINIMUM_ORDER_VALUE = 100

/**
 * Check if a currency is supported for bank transfers
 *
 * @param currency - The currency to check
 * @returns Boolean indicating if currency is supported
 */
export const isCurrencySupported = (currency: string): currency is BankCurrency => {
  return currency in FIATS
}

/**
 * Validate if an amount meets minimum requirements
 *
 * @param amount - The amount to validate
 * @returns Boolean indicating if amount meets minimum
 */
export const getMinimumOrderValue = (circuit?: BankCircuit): number => {
  const config = getBankTransferConfigSync()
  if (circuit === 'swift') return SWIFT_MINIMUM_ORDER_VALUE
  return config.minimumOrderValue
}

export const meetsMinimumAmount = (amount: number, circuit?: BankCircuit): boolean => {
  return amount >= getMinimumOrderValue(circuit)
}

/**
 * Check if an amount requires KYC verification
 *
 * @param amount - The amount to check
 * @returns Boolean indicating if KYC is required
 */
export const requiresKyc = (amount: number): boolean => {
  const config = getBankTransferConfigSync()
  return amount > config.kycThreshold
}
