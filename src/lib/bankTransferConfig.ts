/**
 * Bank Transfer Configuration Service
 *
 * Provides configuration for bank transfers including supported currencies,
 * validation thresholds, and available circuits.
 *
 * The minimum order and KYC threshold come from the provider when it publishes
 * them (ramp, via providers/bankTransfer::getBankTransferLimits), so they
 * follow whatever it is configured with. The legacy Chimera API publishes no
 * limits, so it keeps the hardcoded ones.
 */

import { FIATS, type FiatSymbol } from './fiatConfig'
import { getBankTransferLimits, type BankProviderLimits } from '../providers/bankTransfer'
import { consoleError } from './logs'

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
  /** An i18n key. */
  label: string
  placeholder: string
  uppercase?: boolean
}

const IBAN: BankFieldSpec = { key: 'iban', label: 'common.bankFields.iban', placeholder: 'DE89 3704 0044 0532 0130 00', uppercase: true }
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
    { key: 'bic', label: 'common.bankFields.bicSwift', placeholder: 'DEUTDEFF', uppercase: true },
    HOLDER,
    { key: 'country', label: 'common.bankFields.country', placeholder: 'DE', uppercase: true },
    { key: 'streetName', label: 'common.bankFields.streetName', placeholder: 'Musterstrasse' },
    { key: 'buildingNumber', label: 'common.bankFields.buildingNumber', placeholder: '1' },
    { key: 'townName', label: 'common.bankFields.townName', placeholder: 'Frankfurt' },
    { key: 'postCode', label: 'common.bankFields.postCode', placeholder: '60306' },
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

export interface BankTransferLimits {
  /** Smallest order accepted, in the order's currency */
  minimumOrderValue: number
  /** Orders below this never need KYC verification, in the order's currency */
  kycThreshold: number
}

/**
 * Configuration interface for bank transfers
 */
export interface BankTransferConfig {
  /** List of currencies supported for receiving (deposit) */
  supportedReceiveCurrencies: BankCurrency[]
  /** List of currencies supported for sending (withdrawal) */
  supportedSendCurrencies: BankCurrency[]
  /** Minimum order value, for any currency missing from `limits` */
  minimumOrderValue: number
  /** KYC threshold, for any currency missing from `limits` */
  kycThreshold: number
  /** Limits per currency, as the provider enforces them */
  limits: Partial<Record<BankCurrency, BankTransferLimits>>
  /** The currency the provider defines its limits in (ramp: CHF) */
  limitsCurrency: BankCurrency
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
 * Default hardcoded configuration. The limits are the legacy Chimera API's;
 * with ramp they're replaced by ramp's own (fetchBankTransferConfig).
 */
const DEFAULT_CONFIG: BankTransferConfig = {
  // Receive (deposit): SEPA and SWIFT, EUR only
  supportedReceiveCurrencies: [FIATS.EUR.symbol],
  // Send (withdrawal): SWIFT for EUR/CHF/USD; SEPA for EUR; US Wire for USD
  supportedSendCurrencies: [FIATS.EUR.symbol, FIATS.CHF.symbol, FIATS.USD.symbol],
  minimumOrderValue: 15,
  kycThreshold: 1000,
  limits: {},
  limitsCurrency: FIATS.EUR.symbol,
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

// Cached configuration. Refetched after CONFIG_TTL_MS so a limit changed on
// ramp reaches a long-running session too.
const CONFIG_TTL_MS = 10 * 60 * 1000
let cachedConfig: BankTransferConfig | null = null
let cachedAt = 0

const positiveAmount = (value: unknown): number | undefined => {
  const amount = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN
  return Number.isFinite(amount) && amount > 0 ? amount : undefined
}

// Keeps only currencies this app knows with two usable, positive amounts; any
// other currency falls back to the defaults. An own-property check, so keys
// like `__proto__` or `toString` don't count as currencies (hasOwnProperty
// rather than Object.hasOwn, which older mobile Safari lacks).
const fromProviderLimits = (provider: BankProviderLimits): BankTransferConfig['limits'] => {
  const limits: BankTransferConfig['limits'] = {}
  const byCurrency: unknown = provider?.by_currency
  if (!byCurrency || typeof byCurrency !== 'object') return limits
  for (const [currency, l] of Object.entries(byCurrency)) {
    if (!Object.prototype.hasOwnProperty.call(FIATS, currency)) continue
    const minimumOrderValue = positiveAmount(l?.min_order)
    const kycThreshold = positiveAmount(l?.kyc_threshold)
    if (minimumOrderValue === undefined || kycThreshold === undefined) continue
    limits[currency as BankCurrency] = { minimumOrderValue, kycThreshold }
  }
  return limits
}

/**
 * Fetch bank transfer configuration: the provider's limits when it publishes
 * them (ramp), the hardcoded defaults otherwise.
 */
export const fetchBankTransferConfig = async (): Promise<BankTransferConfig> => {
  const providerLimits = await getBankTransferLimits()
  if (!providerLimits) return DEFAULT_CONFIG
  // Ramp configures its limits in CHF and converts them per currency
  return { ...DEFAULT_CONFIG, limits: fromProviderLimits(providerLimits), limitsCurrency: FIATS.CHF.symbol }
}

/**
 * Get bank transfer configuration (with caching)
 *
 * If the limits can't be fetched, the last known (or default) configuration
 * is returned and the next call tries again. Ramp still enforces its limits
 * when the order is created, so the worst case is its error message.
 *
 * @param forceRefresh - Force fetch fresh config from source
 * @returns Promise resolving to BankTransferConfig
 */
export const getBankTransferConfig = async (forceRefresh = false): Promise<BankTransferConfig> => {
  if (!cachedConfig || forceRefresh || Date.now() - cachedAt > CONFIG_TTL_MS) {
    try {
      cachedConfig = await fetchBankTransferConfig()
      cachedAt = Date.now()
    } catch (err) {
      consoleError(err, 'Could not load bank transfer limits')
      return cachedConfig ?? DEFAULT_CONFIG
    }
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

/** `config`'s limits for orders in `currency`. */
export const limitsFor = (config: BankTransferConfig, currency: BankCurrency = DEFAULT_BANK_CURRENCY): BankTransferLimits =>
  config.limits[currency] ?? { minimumOrderValue: config.minimumOrderValue, kycThreshold: config.kycThreshold }

/**
 * Smallest order `config` accepts, in `currency`. SWIFT has its own, higher
 * minimum on top of the provider's.
 */
export const getMinimumOrderValue = (
  config: BankTransferConfig,
  circuit?: BankCircuit,
  currency?: BankCurrency,
): number => {
  const { minimumOrderValue } = limitsFor(config, currency)
  if (circuit === 'swift') return Math.max(SWIFT_MINIMUM_ORDER_VALUE, minimumOrderValue)
  return minimumOrderValue
}

/**
 * Check if an amount requires KYC verification. Ramp publishes each currency's
 * threshold rounded down, so amounts below it never need KYC; from the
 * threshold up they're treated as needing it.
 *
 * @param amount - The amount to check, in `currency`
 * @returns Boolean indicating if KYC is required
 */
export const requiresKyc = (config: BankTransferConfig, amount: number, currency?: BankCurrency): boolean => {
  return amount >= limitsFor(config, currency).kycThreshold
}

/** `config`'s KYC threshold in the provider's own currency, e.g. "1,000 CHF". */
export const getKycThresholdLabel = (config: BankTransferConfig): string => {
  const { limitsCurrency } = config
  return `${limitsFor(config, limitsCurrency).kycThreshold.toLocaleString()} ${limitsCurrency}`
}
