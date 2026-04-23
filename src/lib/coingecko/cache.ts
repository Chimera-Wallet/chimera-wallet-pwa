import type { CoinGeckoPriceData, CoinGeckoHistoricalData } from './api'
import { consoleLog } from '../logs'

interface CacheEntry<T> {
  data: T
  timestamp: number
  expiresAt: number
}

interface PriceCacheKey {
  symbols: string[]
  vsCurrencies: string[]
}

interface HistoricalCacheKey {
  symbol: string
  vsCurrency: string
  days: number
}

// Cache expiration times (in milliseconds)
const CACHE_EXPIRY = {
  CURRENT_PRICES: 60 * 1000, // 1 minute for current prices
  HISTORICAL_1D: 5 * 60 * 1000, // 5 minutes for 1 day data
  HISTORICAL_1W: 15 * 60 * 1000, // 15 minutes for 1 week data
  HISTORICAL_1M: 30 * 60 * 1000, // 30 minutes for 1 month data
  HISTORICAL_1Y: 60 * 60 * 1000, // 1 hour for 1 year data
  HISTORICAL_MAX: 2 * 60 * 60 * 1000, // 2 hours for max data
}

// Rate limiting
const RATE_LIMIT = {
  MIN_REQUEST_INTERVAL: 1500, // Minimum 1.5 seconds between requests
  MAX_REQUESTS_PER_MINUTE: 30, // CoinGecko free tier limit
}

class CoinGeckoCache {
  private priceCache = new Map<string, CacheEntry<Record<string, CoinGeckoPriceData>>>()
  private historicalCache = new Map<string, CacheEntry<CoinGeckoHistoricalData>>()
  private lastRequestTime = 0
  private requestQueue: (() => Promise<void>)[] = []
  private isProcessingQueue = false
  private requestCount = 0
  private requestCountResetTime = 0

  /**
   * Generate cache key for price data
   */
  private getPriceCacheKey(symbols: string[], vsCurrencies: string[]): string {
    return `prices:${symbols.sort().join(',')}:${vsCurrencies.sort().join(',')}`
  }

  /**
   * Generate cache key for historical data
   */
  private getHistoricalCacheKey(symbol: string, vsCurrency: string, days: number): string {
    return `historical:${symbol}:${vsCurrency}:${days}`
  }

  /**
   * Get cache expiry time based on days parameter
   */
  private getHistoricalExpiry(days: number): number {
    if (days <= 1) return CACHE_EXPIRY.HISTORICAL_1D
    if (days <= 7) return CACHE_EXPIRY.HISTORICAL_1W
    if (days <= 30) return CACHE_EXPIRY.HISTORICAL_1M
    if (days <= 365) return CACHE_EXPIRY.HISTORICAL_1Y
    return CACHE_EXPIRY.HISTORICAL_MAX
  }

  /**
   * Check if cache entry is still valid
   */
  private isValid<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
    if (!entry) return false
    return Date.now() < entry.expiresAt
  }

  /**
   * Get cached price data
   */
  getCachedPrices(symbols: string[], vsCurrencies: string[]): Record<string, CoinGeckoPriceData> | null {
    const key = this.getPriceCacheKey(symbols, vsCurrencies)
    const entry = this.priceCache.get(key)

    if (this.isValid(entry)) {
      consoleLog(`Cache hit for prices: ${symbols.join(',')}`)
      return entry.data
    }

    return null
  }

  /**
   * Set cached price data
   */
  setCachedPrices(symbols: string[], vsCurrencies: string[], data: Record<string, CoinGeckoPriceData>): void {
    const key = this.getPriceCacheKey(symbols, vsCurrencies)
    const now = Date.now()

    this.priceCache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + CACHE_EXPIRY.CURRENT_PRICES,
    })

    consoleLog(`Cached prices for: ${symbols.join(',')}`)
  }

  /**
   * Get cached historical data
   */
  getCachedHistorical(symbol: string, vsCurrency: string, days: number): CoinGeckoHistoricalData | null {
    const key = this.getHistoricalCacheKey(symbol, vsCurrency, days)
    const entry = this.historicalCache.get(key)

    if (this.isValid(entry)) {
      consoleLog(`Cache hit for historical: ${symbol} ${days}d`)
      return entry.data
    }

    return null
  }

  /**
   * Set cached historical data
   */
  setCachedHistorical(symbol: string, vsCurrency: string, days: number, data: CoinGeckoHistoricalData): void {
    const key = this.getHistoricalCacheKey(symbol, vsCurrency, days)
    const now = Date.now()
    const expiry = this.getHistoricalExpiry(days)

    this.historicalCache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + expiry,
    })

    consoleLog(`Cached historical for: ${symbol} ${days}d (expires in ${expiry / 1000}s)`)
  }

  /**
   * Check if we can make a request (rate limiting)
   */
  private canMakeRequest(): boolean {
    const now = Date.now()

    // Reset request count every minute
    if (now - this.requestCountResetTime > 60 * 1000) {
      this.requestCount = 0
      this.requestCountResetTime = now
    }

    // Check rate limits
    if (this.requestCount >= RATE_LIMIT.MAX_REQUESTS_PER_MINUTE) {
      consoleLog('Rate limit reached, waiting...')
      return false
    }

    if (now - this.lastRequestTime < RATE_LIMIT.MIN_REQUEST_INTERVAL) {
      return false
    }

    return true
  }

  /**
   * Process request queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return
    this.isProcessingQueue = true

    while (this.requestQueue.length > 0) {
      if (!this.canMakeRequest()) {
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT.MIN_REQUEST_INTERVAL))
        continue
      }

      const request = this.requestQueue.shift()
      if (request) {
        this.lastRequestTime = Date.now()
        this.requestCount++
        await request()
      }
    }

    this.isProcessingQueue = false
  }

  /**
   * Queue a request with rate limiting
   */
  async queueRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const result = await requestFn()
          resolve(result)
        } catch (error) {
          reject(error)
        }
      })

      this.processQueue()
    })
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    this.priceCache.clear()
    this.historicalCache.clear()
    consoleLog('CoinGecko cache cleared')
  }

  /**
   * Clear expired entries
   */
  clearExpired(): void {
    const now = Date.now()
    let cleared = 0

    for (const [key, entry] of this.priceCache.entries()) {
      if (now >= entry.expiresAt) {
        this.priceCache.delete(key)
        cleared++
      }
    }

    for (const [key, entry] of this.historicalCache.entries()) {
      if (now >= entry.expiresAt) {
        this.historicalCache.delete(key)
        cleared++
      }
    }

    if (cleared > 0) {
      consoleLog(`Cleared ${cleared} expired cache entries`)
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { priceEntries: number; historicalEntries: number; requestCount: number } {
    return {
      priceEntries: this.priceCache.size,
      historicalEntries: this.historicalCache.size,
      requestCount: this.requestCount,
    }
  }
}

// Export singleton instance
export const coingeckoCache = new CoinGeckoCache()

// Clear expired entries periodically
setInterval(
  () => {
    coingeckoCache.clearExpired()
  },
  5 * 60 * 1000,
) // Every 5 minutes
