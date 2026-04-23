import { useEffect, useState, useRef } from 'react'
import { CoinGeckoConversionService } from '../lib/coingecko/service'
import { getAssetColor, type AssetSymbol } from '../lib/assets'
import { consoleError } from '../lib/logs'

type Timeframe = '1D' | '1W' | '1M' | '1Y' | 'MAX'

interface PriceChartProps {
  symbol: AssetSymbol | string
  vsCurrency?: string
}

const TIMEFRAME_DAYS: Record<Timeframe, number> = {
  '1D': 1,
  '1W': 7,
  '1M': 30,
  '1Y': 365,
  MAX: 1825, // 5 years
}

const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '1Y', 'MAX']

export default function PriceChart({ symbol, vsCurrency = 'usd' }: PriceChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('1M')
  const [prices, setPrices] = useState<[number, number][]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Track if we have cached data to show while loading new data
  const hasCachedData = useRef(false)

  const colorVar = getAssetColor(symbol)

  useEffect(() => {
    let isMounted = true

    const fetchPrices = async () => {
      // Only show loading spinner if we don't have cached data
      if (!hasCachedData.current) {
        setLoading(true)
      }
      setError(null)

      try {
        const days = TIMEFRAME_DAYS[timeframe]
        const data = await CoinGeckoConversionService.getHistoricalPrices(symbol, vsCurrency, days)

        if (isMounted) {
          setPrices(data.prices)
          hasCachedData.current = true
        }
      } catch (err) {
        consoleError(err, `Failed to fetch price history for ${symbol}`)
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
  }, [symbol, timeframe, vsCurrency])

  // Calculate chart dimensions and path
  const chartHeight = 120
  const chartWidth = 320

  const getChartPath = (): string => {
    if (prices.length < 2) return ''

    const minPrice = Math.min(...prices.map((p) => p[1]))
    const maxPrice = Math.max(...prices.map((p) => p[1]))
    const priceRange = maxPrice - minPrice || 1

    const points = prices.map((p, i) => {
      const x = (i / (prices.length - 1)) * chartWidth
      const y = chartHeight - ((p[1] - minPrice) / priceRange) * (chartHeight - 10)
      return `${x},${y}`
    })

    return `M ${points.join(' L ')}`
  }

  return (
    <div style={{ width: '100%', padding: '0 0 16px 0' }}>
      {/* Chart */}
      <div
        style={{
          width: '100%',
          height: chartHeight,
          position: 'relative',
          marginBottom: 16,
        }}
      >
        {loading && prices.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--white50)',
              fontSize: 14,
            }}
          >
            Loading chart...
          </div>
        ) : error && prices.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--red)',
              fontSize: 14,
            }}
          >
            {error}
          </div>
        ) : (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <svg
              width='100%'
              height={chartHeight}
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              preserveAspectRatio='none'
              style={{
                overflow: 'visible',
                opacity: loading ? 0.6 : 1,
                transition: 'opacity 0.2s ease',
              }}
            >
              {/* Gradient fill under the line */}
              <defs>
                <linearGradient id={`gradient-${symbol}`} x1='0%' y1='0%' x2='0%' y2='100%'>
                  <stop offset='0%' stopColor={`var(--${colorVar})`} stopOpacity='0.3' />
                  <stop offset='100%' stopColor={`var(--${colorVar})`} stopOpacity='0' />
                </linearGradient>
              </defs>

              {/* Fill area */}
              {prices.length >= 2 && (
                <path
                  d={`${getChartPath()} L ${chartWidth},${chartHeight} L 0,${chartHeight} Z`}
                  fill={`url(#gradient-${symbol})`}
                />
              )}

              {/* Line */}
              <path
                d={getChartPath()}
                fill='none'
                stroke={`var(--${colorVar})`}
                strokeWidth='2'
                strokeLinecap='round'
                strokeLinejoin='round'
              />
            </svg>
            {loading ? (
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  color: 'var(--white70)',
                  fontSize: 12,
                  background: 'rgba(0,0,0,0.5)',
                  padding: '4px 8px',
                  borderRadius: 4,
                }}
              >
                Updating...
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Timeframe Buttons */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'center',
        }}
      >
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            style={{
              background: timeframe === tf ? `var(--${colorVar})` : 'var(--white10)',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              color: timeframe === tf ? 'white' : 'var(--white60)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {tf}
          </button>
        ))}
      </div>
    </div>
  )
}
