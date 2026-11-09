import { useContext, useMemo, useState } from 'react'
import { heldAssets, walletValueHistory } from '../lib/balanceHistory'
import { useHistoricalPrices, type Timeframe } from '../hooks/useHistoricalPrices'
import { ConfigContext } from '../providers/config'
import { WalletContext } from '../providers/wallet'
import TimeseriesChart from './TimeseriesChart'

/** Home-screen chart of the whole wallet's value — every held asset combined —
 * in the user's selected fiat, each valued at its historical price. */
export default function BalanceChart() {
  const { config } = useContext(ConfigContext)
  const { balance, assetBalances, txs } = useContext(WalletContext)
  const [timeframe, setTimeframe] = useState<Timeframe>('1M')

  const assets = useMemo(() => heldAssets(balance, assetBalances, txs), [balance, assetBalances, txs])
  const { prices, loading, error } = useHistoricalPrices(
    assets.map((a) => a.symbol),
    config.fiat.toLowerCase(),
    timeframe,
  )

  const series = useMemo(
    () => walletValueHistory(assets.map((a) => ({ ...a, prices: prices[a.symbol] ?? [] })), txs),
    [assets, prices, txs],
  )

  // The home screen drops the chart quietly when prices can't be fetched,
  // rather than showing the asset pages' error. The hook only errors when it
  // has no earlier series to keep showing.
  if (error) return null

  return (
    <TimeseriesChart
      series={series}
      loading={loading}
      error={null}
      colorVar='blue-primary'
      timeframe={timeframe}
      onTimeframeChange={setTimeframe}
    />
  )
}
