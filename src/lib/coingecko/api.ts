import { consoleError, consoleLog } from '../logs'
import { coingeckoCache } from './cache'

export type CoinGeckoAssetID = string

export interface CoinGeckoPriceData {
  chf: number
  chf_24h_change?: number
  eur?: number
  eur_24h_change?: number
  usd?: number
  usd_24h_change?: number
}

export interface CoinGeckoHistoricalData {
  prices: [number, number][] // [timestamp, price]
  market_caps?: [number, number][]
  total_volumes?: [number, number][]
}

export interface CoinGeckoMarketData {
  id: string
  symbol: string
  name: string
  current_price: number
  market_cap: number
  price_change_percentage_24h: number
}

const COINGECKO_API_BASE = '/api/coingecko'

class CoinGeckoApi {
  /**
   * Get current conversion rates for multiple assets (with caching)
   */
  async getConversionRates(
    coinIds: CoinGeckoAssetID[],
    vsCurrencies: string[] = ['chf', 'eur', 'usd'],
    include24hChange: boolean = true,
  ): Promise<Record<string, CoinGeckoPriceData>> {
    // Check cache first
    const cached = coingeckoCache.getCachedPrices(coinIds, vsCurrencies)
    if (cached) {
      return cached
    }

    // Queue the request to handle rate limiting
    return coingeckoCache.queueRequest(async () => {
      try {
        const ids = coinIds.join(',')
        const currencies = vsCurrencies.join(',')
        const changeParam = include24hChange ? 'true' : 'false'

        const url = `${COINGECKO_API_BASE}/simple/price?ids=${ids}&vs_currencies=${currencies}&include_24hr_change=${changeParam}`

        consoleLog(`Fetching CoinGecko rates for: ${ids}`)

        const response = await fetch(url)

        if (!response.ok) {
          throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()

        // Transform the response to match our format
        const result: Record<string, CoinGeckoPriceData> = {}

        for (const [coinId, prices] of Object.entries(data)) {
          const priceData = prices as Record<string, number>
          result[coinId] = {
            chf: priceData.chf || 0,
            chf_24h_change: priceData.chf_24h_change,
            eur: priceData.eur,
            eur_24h_change: priceData.eur_24h_change,
            usd: priceData.usd,
            usd_24h_change: priceData.usd_24h_change,
          }
        }

        // Cache the result
        coingeckoCache.setCachedPrices(coinIds, vsCurrencies, result)

        return result
      } catch (error) {
        consoleError(error, 'Failed to fetch CoinGecko conversion rates')
        throw error
      }
    })
  }

  /**
   * Get historical price data for an asset (with caching)
   */
  async getHistoricalPrices(
    coinId: CoinGeckoAssetID,
    vsCurrency: string = 'usd',
    days: number = 30,
  ): Promise<CoinGeckoHistoricalData> {
    // Check cache first
    const cached = coingeckoCache.getCachedHistorical(coinId, vsCurrency, days)
    if (cached) {
      return cached
    }

    // Queue the request to handle rate limiting
    return coingeckoCache.queueRequest(async () => {
      try {
        const url = `${COINGECKO_API_BASE}/coins/${coinId}/market_chart?vs_currency=${vsCurrency}&days=${days}`

        consoleLog(`Fetching historical data for ${coinId} (${days}d)`)

        const response = await fetch(url)

        if (!response.ok) {
          throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`)
        }

        const data = (await response.json()) as CoinGeckoHistoricalData

        // Cache the result
        coingeckoCache.setCachedHistorical(coinId, vsCurrency, days, data)

        return data
      } catch (error) {
        consoleError(error, `Failed to fetch historical data for ${coinId}`)
        throw error
      }
    })
  }

  /**
   * Get market data for multiple assets
   */
  async getMarketData(coinIds: CoinGeckoAssetID[], vsCurrency: string = 'usd'): Promise<CoinGeckoMarketData[]> {
    try {
      const ids = coinIds.join(',')
      const url = `${COINGECKO_API_BASE}/coins/markets?vs_currency=${vsCurrency}&ids=${ids}&order=market_cap_desc&sparkline=false`

      consoleLog(`Fetching market data for: ${ids}`)

      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      consoleError(error, 'Failed to fetch market data')
      throw error
    }
  }

  /**
   * Search for coins by query
   */
  async searchCoins(query: string): Promise<{ id: string; symbol: string; name: string }[]> {
    try {
      const url = `${COINGECKO_API_BASE}/search?query=${encodeURIComponent(query)}`

      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      return data.coins || []
    } catch (error) {
      consoleError(error, 'Failed to search coins')
      throw error
    }
  }
}

export default new CoinGeckoApi()
