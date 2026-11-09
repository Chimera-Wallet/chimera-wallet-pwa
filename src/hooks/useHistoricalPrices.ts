import { useEffect, useRef, useState } from 'react'
import { CoinGeckoConversionService } from '../lib/coingecko/service'
import { consoleError } from '../lib/logs'

export type Timeframe = '1D' | '1W' | '1M' | '1Y' | 'MAX'

export const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '1Y', 'MAX']

const TIMEFRAME_DAYS: Record<Timeframe, number | 'max'> = {
  '1D': 1,
  '1W': 7,
  '1M': 30,
  '1Y': 365,
  MAX: 'max',
}

export type PriceSeries = [number, number][] // [timestampMs, price]

/** Price history for each of `symbols` over `timeframe`, keyed by symbol.
 * Keeps showing the previous series while a new timeframe loads. A failure for
 * any symbol is an error: a partial set would chart a wrong total. */
export function useHistoricalPrices(symbols: string[], vsCurrency: string, timeframe: Timeframe) {
  const [prices, setPrices] = useState<Record<string, PriceSeries>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Track if we have cached data to show while loading new data
  const hasCachedData = useRef(false)

  // a stable dependency for the effect, whatever array identity callers pass
  const symbolsKey = symbols.join(',')

  useEffect(() => {
    let isMounted = true
    const wanted = symbolsKey ? symbolsKey.split(',') : []

    const fetchPrices = async () => {
      // Only show loading spinner if we don't have cached data
      if (!hasCachedData.current) {
        setLoading(true)
      }
      setError(null)

      try {
        const results = await Promise.all(
          wanted.map((symbol) =>
            CoinGeckoConversionService.getHistoricalPrices(symbol, vsCurrency, TIMEFRAME_DAYS[timeframe]),
          ),
        )

        if (isMounted) {
          setPrices(Object.fromEntries(wanted.map((symbol, i) => [symbol, results[i].prices])))
          hasCachedData.current = true
        }
      } catch (err) {
        consoleError(err, `Failed to fetch price history for ${symbolsKey}`)
        if (isMounted && !hasCachedData.current) {
          setError('Failed to load price data')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchPrices()

    return () => {
      isMounted = false
    }
  }, [symbolsKey, timeframe, vsCurrency])

  return { prices, loading, error }
}
