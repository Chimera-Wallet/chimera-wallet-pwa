import AssetIcon from '../icons/AssetIcon'
import { getAssetConfig, type AssetSymbol } from '../lib/assets'
import { Fiats } from '../lib/types'

interface AssetRowProps {
  symbol: AssetSymbol | string
  ticker?: string
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
  ticker,
  name,
  balance = 0,
  balanceFiat,
  currency = Fiats.USD,
  percentChange,
  badge,
  onClick,
  isLast = false,
}: AssetRowProps) {
  const config = getAssetConfig(symbol)
  const precision = config?.precision || 8
  const displayTicker = ticker ?? symbol

  // Undefined means "no market data for this asset" (see AssetConfig.noMarketData),
  // which is different from "no movement" — a proprietary token with no public
  // feed must not be reported as flat at 0.00%.
  const hasChange = typeof percentChange === 'number' && Number.isFinite(percentChange)
  // Same rule for the fiat line: undefined means the asset has no defined price
  // yet, which must render as nothing rather than as a confident "0.00".
  const hasFiat = typeof balanceFiat === 'number' && Number.isFinite(balanceFiat)
  const isPositive = (percentChange ?? 0) >= 0
  const changeColor = isPositive ? 'var(--green-positive)' : 'var(--red-negative)'
  const formattedChange = `${Math.abs(percentChange ?? 0).toFixed(2)}%`
  const changeIcon = isPositive ? '/images/icons/ upGreen.png' : '/images/icons/ downRed.png'

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
                backgroundColor: 'var(--neutral-200)',
                borderRadius: 4,
                fontSize: 9,
                fontWeight: 700,
                padding: '2px 5px',
                color: 'var(--fg)',
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
        {/* The 80px column stays even with nothing in it, so rows without market
            data keep the balance column aligned with the rest of the list. */}
        {hasChange ? (
          <>
            <img
              src={changeIcon}
              alt={isPositive ? 'Up' : 'Down'}
              width={16}
              height={16}
              style={{ display: 'block', objectFit: 'contain', color: 'rgba(29,255,120,1)' }}
            />
            <span>{formattedChange}</span>
          </>
        ) : null}
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
            fontFamily: 'Titillium Web',
          }}
        >
          {formatBalance(balance)} {displayTicker}
        </span>
        {hasFiat ? (
          <span
            style={{
              color: 'var(--white40)',
              fontSize: 11,
              fontWeight: 400,
            }}
          >
            {formatUsd(balanceFiat)} {currency}
          </span>
        ) : null}
      </div>
    </div>
  )
}
