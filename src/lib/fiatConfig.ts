// Fiat currency configuration - single source of truth

export interface FiatConfig {
  symbol: string
  name: string
  precision: number
}

export const FIATS = {
  CHF: {
    symbol: 'CHF',
    name: 'Swiss Franc',
    precision: 2,
  },
  EUR: {
    symbol: 'EUR',
    name: 'Euro',
    precision: 2,
  },
  USD: {
    symbol: 'USD',
    name: 'US Dollar',
    precision: 2,
  },
  JPY: {
    symbol: 'JPY',
    name: 'Japanese Yen',
    precision: 0,
  },
  GBP: {
    symbol: 'GBP',
    name: 'British Pound',
    precision: 2,
  },
  CNY: {
    symbol: 'CNY',
    name: 'Chinese Yuan',
    precision: 2,
  },
} as const

export type FiatSymbol = keyof typeof FIATS

export const FIAT_LIST: FiatConfig[] = Object.values(FIATS)

export const getFiatConfig = (symbol: string): FiatConfig | undefined => {
  return FIATS[symbol.toUpperCase() as FiatSymbol]
}

// Static fiat exchange rates (for fiat-to-fiat conversions)
// In a real app, these would come from an exchange rate API
export const FIAT_EXCHANGE_RATES: Record<FiatSymbol, Record<FiatSymbol, number>> = {
  CHF: {
    CHF: 1.0,
    EUR: 0.92,
    USD: 1.1,
    JPY: 165,
    GBP: 0.79,
    CNY: 8.0,
  },
  EUR: {
    CHF: 1.09,
    EUR: 1.0,
    USD: 1.08,
    JPY: 160,
    GBP: 0.86,
    CNY: 7.7,
  },
  USD: {
    CHF: 0.91,
    EUR: 0.93,
    USD: 1.0,
    JPY: 150,
    GBP: 0.79,
    CNY: 7.2,
  },
  JPY: {
    CHF: 0.006,
    EUR: 0.0062,
    USD: 0.0067,
    JPY: 1.0,
    GBP: 0.0053,
    CNY: 0.048,
  },
  GBP: {
    CHF: 1.27,
    EUR: 1.17,
    USD: 1.27,
    JPY: 190,
    GBP: 1.0,
    CNY: 9.1,
  },
  CNY: {
    CHF: 0.125,
    EUR: 0.13,
    USD: 0.14,
    JPY: 21,
    GBP: 0.11,
    CNY: 1.0,
  },
}
