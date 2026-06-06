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
  bic: string // BIC/SWIFT code
  accountHolderName: string
  accountNumber: string
}

export interface BankDataUs {
  circuit: 'us'
  accountNumber: string
  routingNumber: string
}

export type BankData = BankDataSepa | BankDataSwift | BankDataUs

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
