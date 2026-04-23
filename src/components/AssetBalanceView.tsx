import AssetIcon from '../icons/AssetIcon'
import PriceChart from './PriceChart'
import { getAssetConfig, type AssetSymbol } from '../lib/assets'

interface AssetBalanceViewProps {
  symbol: AssetSymbol | string
  balance: number
}

export default function AssetBalanceView({ symbol, balance }: AssetBalanceViewProps) {
  const config = getAssetConfig(symbol)
  const assetName = config?.name || symbol
  const precision = config?.precision || 8

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
          <div style={{ fontSize: 14, color: 'var(--white50)' }}>{symbol}</div>
        </div>
      </div>

      {/* Balance */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: 'white',
            fontFamily: 'monospace',
          }}
        >
          {formatBalance(balance)} {symbol}
        </div>
      </div>

      {/* Price Chart */}
      <PriceChart symbol={symbol} vsCurrency='usd' />
    </div>
  )
}
