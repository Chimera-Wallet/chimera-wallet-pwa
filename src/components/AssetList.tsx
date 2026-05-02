import { useContext, useEffect, useState } from 'react'
import AssetRow from './AssetRow'
import { ASSET_LIST, type AssetSymbol } from '../lib/assets'
import { CoinGeckoConversionService, type ConversionRateResult } from '../lib/coingecko/service'
import { consoleError } from '../lib/logs'
import { ConfigContext } from '../providers/config'

// Filter icon component
const FilterIcon = () => (
  <svg width='18' height='18' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
    <path d='M4 6h16M6 12h12M8 18h8' stroke='currentColor' strokeWidth='2' strokeLinecap='round' />
  </svg>
)

interface AssetBalance {
  symbol: AssetSymbol
  balance: number
}

interface AssetListProps {
  balances?: AssetBalance[]
  onAssetClick?: (symbol: AssetSymbol) => void
}

export default function AssetList({ balances = [], onAssetClick }: AssetListProps) {
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

  const getBalance = (symbol: AssetSymbol): number => {
    const found = balances.find((b) => b.symbol === symbol)
    return found?.balance || 0
  }

  const getPriceData = (symbol: string) => {
    const data = prices[symbol] as Record<string, number> | undefined
    return {
      rate: data?.[currency] || 0,
      change: data?.[`${currency}_24h_change`],
    }
  }

  return (
    <div
      style={{
        padding: '12px 16px',
        width: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 12,
          borderBottom: '1px solid var(--white07)',
          marginBottom: 4,
        }}
      >
        <span
          style={{
            color: 'white',
            fontSize: 18,
            fontWeight: 600,
          }}
        >
          Assets
        </span>
        <button
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            opacity: 0.6,
            color: 'white',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label='Filter assets'
        >
          <FilterIcon />
        </button>
      </div>

      {/* Asset Rows */}
      <div>
        {loading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px 0',
              color: 'var(--white50)',
              fontSize: 14,
            }}
          >
            Loading prices...
          </div>
        ) : (
          ASSET_LIST.map((asset, index) => {
            const symbol = asset.symbol as AssetSymbol
            const balance = getBalance(symbol)
            const priceData = getPriceData(asset.symbol)
            const balanceFiat = balance * priceData.rate

            return (
              <AssetRow
                key={asset.symbol}
                symbol={asset.symbol}
                name={asset.name}
                balance={balance}
                balanceFiat={balanceFiat}
                currency={config.fiat}
                percentChange={priceData.change || 0}
                badge={asset.comingSoon ? 'Coming Soon' : undefined}
                onClick={!asset.comingSoon && onAssetClick ? () => onAssetClick(symbol) : undefined}
                isLast={index === ASSET_LIST.length - 1}
              />
            )
          })
        )}
      </div>
    </div>
  )
}
