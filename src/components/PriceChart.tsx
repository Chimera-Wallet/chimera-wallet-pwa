import { useState } from 'react'
import { getAssetColor, type AssetSymbol } from '../lib/assets'
import { useHistoricalPrices, type Timeframe } from '../hooks/useHistoricalPrices'
import TimeseriesChart from './TimeseriesChart'

interface PriceChartProps {
  symbol: AssetSymbol | string
  vsCurrency?: string
}

export default function PriceChart({ symbol, vsCurrency = 'usd' }: PriceChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('1M')
  const { prices, loading, error } = useHistoricalPrices([symbol], vsCurrency, timeframe)

  return (
    <TimeseriesChart
      series={prices[symbol] ?? []}
      loading={loading}
      error={error}
      colorVar={getAssetColor(symbol)}
      timeframe={timeframe}
      onTimeframeChange={setTimeframe}
    />
  )
}
