/**
 * Bank Transfer Configuration Service
 *
 * Provides configuration for bank transfers including supported currencies,
 * validation thresholds, and available circuits.
 *
 * Currently uses hardcoded defaults, but structured for future backend integration.
 * When ready to integrate with backend, replace fetchBankTransferConfig() implementation.
 */

// Bank circuit types for different transfer methods
export type BankCircuit = 'sepa' | 'swift' | 'us'

// Fiat currency type for bank transfers
export type BankCurrency = 'EUR' | 'CHF' | 'USD'

// Bank data interfaces for withdrawals
export interface BankDataSepa {
  circuit: 'sepa'
  destinationBankAddress: string // IBAN
  accountHolderName: string
}

export interface BankDataSwift {
  circuit: 'swift'
  destinationBankAddress: string // IBAN
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
  /** List of supported fiat currencies for bank transfers */
  supportedCurrencies: BankCurrency[]
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
  supportedCurrencies: ['EUR'],
  minimumOrderValue: 15,
  kycThreshold: 1000,
  defaultCurrency: 'EUR',
  circuitsPerCurrency: {
    EUR: ['sepa', 'swift'],
    CHF: ['sepa', 'swift'],
    USD: ['swift', 'us'],
  },
  circuitLabels: {
    sepa: 'SEPA Transfer',
    swift: 'SWIFT Transfer',
    us: 'US Wire Transfer',
  },
  currencyLabels: {
    EUR: 'Euro (EUR)',
    CHF: 'Swiss Franc (CHF)',
    USD: 'US Dollar (USD)',
  },
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
 * Check if a currency is supported for bank transfers
 *
 * @param currency - The currency to check
 * @returns Boolean indicating if currency is supported
 */
export const isCurrencySupported = (currency: string): currency is BankCurrency => {
  const config = getBankTransferConfigSync()
  return config.supportedCurrencies.includes(currency as BankCurrency)
}

/**
 * Validate if an amount meets minimum requirements
 *
 * @param amount - The amount to validate
 * @returns Boolean indicating if amount meets minimum
 */
export const meetsMinimumAmount = (amount: number): boolean => {
  const config = getBankTransferConfigSync()
  return amount >= config.minimumOrderValue
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
