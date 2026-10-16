import { ReactNode, createContext, useContext, useEffect, useState } from 'react'
import { ASSET_LIST, getAssetConfig } from '../lib/assets'
import { CoinGeckoConversionService, type ConversionRateResult } from '../lib/coingecko/service'
import { consoleError } from '../lib/logs'
import { ConfigContext } from './config'

type PriceData = { rate: number; change?: number }

type AssetPricesContextProps = {
  /** Current price and 24h change of `symbol` in the user's fiat. An asset with
   * no defined price source (`noMarketData`, e.g. CEXT, mapped to bitcoin as a
   * placeholder) has rate 0 and no change, so it's never valued at another
   * asset's price. */
  getPriceData: (symbol: string) => PriceData
  loading: boolean
}

export const AssetPricesContext = createContext<AssetPricesContextProps>({
  getPriceData: () => ({ rate: 0 }),
  loading: false,
})

/** Current prices of every listed asset, fetched once for the whole app and
 * refreshed every minute, so the home total, asset list and transaction rows
 * all value assets at the same price without each fetching their own. */
export const AssetPricesProvider = ({ children }: { children: ReactNode }) => {
  const { config } = useContext(ConfigContext)
  const currency = config.fiat.toLowerCase()

  const [prices, setPrices] = useState<ConversionRateResult>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const symbols = ASSET_LIST.map((a) => a.symbol)
        const rates = await CoinGeckoConversionService.getBulkConversionRates(symbols, {
          vsCurrencies: [currency],
          include24hChange: true,
        })
        setPrices(rates)
      } catch (error) {
        consoleError(error, 'Failed to fetch asset prices')
      } finally {
        setLoading(false)
      }
    }

    fetchPrices()

    // Refresh prices every 60 seconds
    const interval = setInterval(fetchPrices, 60000)
    return () => clearInterval(interval)
  }, [currency])

  const getPriceData = (symbol: string): PriceData => {
    if (getAssetConfig(symbol)?.noMarketData) return { rate: 0 }
    const data = prices[symbol] as unknown as Record<string, number> | undefined
    return {
      rate: data?.[currency] || 0,
      change: data?.[`${currency}_24h_change`],
    }
  }

  return <AssetPricesContext.Provider value={{ getPriceData, loading }}>{children}</AssetPricesContext.Provider>
}
