import CoinGeckoApi, { type CoinGeckoAssetID, type CoinGeckoPriceData } from './api'
import {
  getAssetMapping,
  getCoingeckoIdForSymbol,
  getUniqueCoingeckoIds,
  requiresSpecialHandling,
  SYMBOL_TO_MAPPING_MAP,
} from './mapping'
import { FIATS, FIAT_EXCHANGE_RATES, type FiatSymbol } from '../fiatConfig'
import { consoleError, consoleLog } from '../logs'

export interface ConversionRateResult {
  [symbol: string]: CoinGeckoPriceData
}

export interface BulkConversionOptions {
  vsCurrencies?: string[]
  include24hChange?: boolean
  customRates?: { [symbol: string]: { chf: number; eur?: number; usd?: number } }
}

export class CoinGeckoConversionService {
  /**
   * Get bulk conversion rates for multiple assets
   */
  static async getBulkConversionRates(
    identifiers: string[],
    options: BulkConversionOptions = {},
  ): Promise<ConversionRateResult> {
    const { vsCurrencies = ['chf', 'eur', 'usd'], include24hChange = true, customRates = {} } = options

    const result: ConversionRateResult = {}

    // Handle special cases (fiat currencies)
    for (const identifier of identifiers) {
      const mapping = getAssetMapping(identifier)
      const fiatSymbol = identifier.toUpperCase() as FiatSymbol

      if (FIATS[fiatSymbol]) {
        const rates = FIAT_EXCHANGE_RATES[fiatSymbol]
        result[identifier] = {
          chf: rates.CHF,
          chf_24h_change: 0,
          eur: rates.EUR,
          eur_24h_change: 0,
          usd: rates.USD,
          usd_24h_change: 0,
        }
      }
    }

    // Apply custom rates
    for (const [identifier, rates] of Object.entries(customRates)) {
      if (identifiers.includes(identifier)) {
        result[identifier] = {
          chf: rates.chf,
          eur: rates.eur || 0,
          usd: rates.usd || 0,
        }
      }
    }

    // Filter identifiers that need API calls
    const identifiersNeedingApi = identifiers.filter(
      (identifier) => !requiresSpecialHandling(identifier) && !customRates[identifier] && !result[identifier],
    )

    if (identifiersNeedingApi.length === 0) {
      return result
    }

    try {
      const coingeckoIds = getUniqueCoingeckoIds(identifiersNeedingApi)

      if (coingeckoIds.length === 0) {
        consoleLog('No valid CoinGecko IDs found for identifiers:', identifiersNeedingApi.join(', '))
        return result
      }

      consoleLog(`Fetching rates for ${coingeckoIds.length} unique CoinGecko IDs:`, coingeckoIds.join(', '))

      const apiRates = await CoinGeckoApi.getConversionRates(coingeckoIds, vsCurrencies, include24hChange)

      for (const identifier of identifiersNeedingApi) {
        const coingeckoId = getCoingeckoIdForSymbol(identifier)

        if (coingeckoId && apiRates[coingeckoId]) {
          result[identifier] = apiRates[coingeckoId]
        } else {
          consoleLog(`No conversion rate found for identifier: ${identifier} (CoinGecko ID: ${coingeckoId})`)
          result[identifier] = { chf: 0, eur: 0, usd: 0 }
        }
      }
    } catch (error) {
      consoleError(error, 'Failed to fetch bulk conversion rates')

      // Provide fallback rates for all requested identifiers
      for (const identifier of identifiersNeedingApi) {
        if (!result[identifier]) {
          result[identifier] = { chf: 0, eur: 0, usd: 0 }
        }
      }
    }

    return result
  }

  /**
   * Get conversion rate for a single asset
   */
  static async getSingleConversionRate(symbol: string, targetCurrency: string = 'chf'): Promise<number | null> {
    try {
      const rates = await this.getBulkConversionRates([symbol], {
        vsCurrencies: [targetCurrency],
      })

      return rates[symbol]?.[targetCurrency as keyof CoinGeckoPriceData] as number | null
    } catch (error) {
      consoleError(error, `Failed to get conversion rate for ${symbol}`)
      return null
    }
  }

  /**
   * Convert an amount from one asset to target currency
   */
  static async convertAmount(amount: number, fromSymbol: string, toCurrency: string = 'chf'): Promise<number | null> {
    const rate = await this.getSingleConversionRate(fromSymbol, toCurrency)

    if (rate === null) {
      return null
    }

    return amount * rate
  }

  /**
   * Get historical prices for an asset
   */
  static async getHistoricalPrices(symbol: string, vsCurrency: string = 'usd', days: number = 30) {
    const coingeckoId = getCoingeckoIdForSymbol(symbol)

    if (!coingeckoId) {
      throw new Error(`No CoinGecko ID found for symbol: ${symbol}`)
    }

    return CoinGeckoApi.getHistoricalPrices(coingeckoId, vsCurrency, days)
  }

  /**
   * Get all supported asset symbols
   */
  static getSupportedAssets(): string[] {
    return Array.from(SYMBOL_TO_MAPPING_MAP.keys())
  }

  /**
   * Check if an asset symbol is supported
   */
  static isAssetSupported(identifier: string): boolean {
    return SYMBOL_TO_MAPPING_MAP.has(identifier.toUpperCase()) || !!getAssetMapping(identifier)
  }

  /**
   * Get asset mapping information
   */
  static getAssetMapping(symbol: string) {
    return getAssetMapping(symbol)
  }

  /**
   * Validate that all identifiers have valid mappings
   */
  static validateSymbols(identifiers: string[]) {
    const valid: string[] = []
    const invalid: string[] = []

    for (const identifier of identifiers) {
      if (this.isAssetSupported(identifier)) {
        valid.push(identifier)
      } else {
        invalid.push(identifier)
      }
    }

    return { valid, invalid }
  }
}
