import AssetIcon from '../icons/AssetIcon'
import { getAssetConfig, type AssetSymbol } from '../lib/assets'
import { Fiats } from '../lib/types'

interface AssetRowProps {
  symbol: AssetSymbol | string
  name: string
  balance?: number
  balanceFiat?: number
  currency?: string
  percentChange?: number
  badge?: string
  onClick?: () => void
  isLast?: boolean
}

export default function AssetRow({
  symbol,
  name,
  balance = 0,
  balanceFiat = 0,
  currency = Fiats.USD,
  percentChange = 0,
  badge,
  onClick,
  isLast = false,
}: AssetRowProps) {
  const config = getAssetConfig(symbol)
  const precision = config?.precision || 8

  const isPositive = percentChange >= 0
  const changeColor = isPositive ? 'var(--green-positive)' : 'var(--red-negative)'
  const changeArrow = isPositive ? '↑' : '↓'
  const formattedChange = `${changeArrow} ${Math.abs(percentChange).toFixed(2)}%`

  // Format balance with asset's configured precision
  const formatBalance = (value: number): string => {
    return value.toLocaleString('de-CH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: precision,
    })
  }

  const formatUsd = (value: number): string => {
    return value.toLocaleString('de-CH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 64,
        padding: '10px 0',
        borderBottom: isLast ? 'none' : '1px solid var(--white05)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.15s ease',
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (onClick) e.currentTarget.style.background = 'var(--white03)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      {/* Left Section - Icon + Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
        <AssetIcon symbol={symbol} size={44} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              color: 'white',
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: '0.3px',
            }}
          >
            {name}
          </span>
          {badge ? (
            <span
              style={{
                background: 'var(--white10)',
                borderRadius: 4,
                fontSize: 9,
                fontWeight: 700,
                color: 'var(--white50)',
                padding: '2px 5px',
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                marginTop: 2,
                width: 'fit-content',
              }}
            >
              {badge}
            </span>
          ) : null}
        </div>
      </div>

      {/* Center Section - Percentage Change */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          color: changeColor,
          fontSize: 13,
          fontWeight: 500,
          width: 80,
          flexShrink: 0,
        }}
      >
        {formattedChange}
      </div>

      {/* Right Section - Balance */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          flex: 1,
          minWidth: 0,
        }}
      >
        <span
          style={{
            color: 'white',
            fontSize: 13,
            fontWeight: 500,
            fontFamily: 'monospace',
          }}
        >
          {formatBalance(balance)} {symbol}
        </span>
        <span
          style={{
            color: 'var(--white40)',
            fontSize: 11,
            fontWeight: 400,
          }}
        >
          {formatUsd(balanceFiat)} {currency}
        </span>
      </div>
    </div>
  )
}
