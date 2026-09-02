import AssetIcon from '../icons/AssetIcon'
import PriceChart from './PriceChart'
import { getAssetConfig, getDisplayTicker, type AssetSymbol } from '../lib/assets'

interface AssetBalanceViewProps {
  symbol: AssetSymbol | string
  balance: number
}

export default function AssetBalanceView({ symbol, balance }: AssetBalanceViewProps) {
  const config = getAssetConfig(symbol)
  const assetName = config?.name || symbol
  const precision = config?.precision || 8
  const ticker = getDisplayTicker(symbol)

  // Format balance using asset's configured precision
  const formatBalance = (value: number): string => {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: precision,
    })
  }

  return (
    <div style={{ width: '100%' }}>
      {/* Asset Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <AssetIcon symbol={symbol} size={48} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, color: 'white' }}>{assetName}</div>
          <div style={{ fontSize: 14, color: 'var(--white50)' }}>{ticker}</div>
        </div>
      </div>

      {/* Balance */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: 'white',
            fontFamily: 'Titillium Web',
          }}
        >
          {formatBalance(balance)} {ticker}
        </div>
      </div>

      {/* Price Chart — omitted for assets with no defined price source. The
          chart pulls from the same CoinGecko mapping as the fiat conversion, so
          for CEXT (mapped to bitcoin as a placeholder) it would draw bitcoin's
          history under a CEXT heading. */}
      {config?.noMarketData ? null : <PriceChart symbol={symbol} vsCurrency='usd' />}
    </div>
  )
}
