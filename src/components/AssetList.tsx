import { useContext } from 'react'
import AssetRow from './AssetRow'
import {
  getHomeAssetList,
  getDisplayTicker,
  truncatedAssetId,
  wrappedAmountToNumber,
  type AssetSymbol,
  type UnlistedAsset,
} from '../lib/assets'
import { AssetPricesContext } from '../providers/assetPrices'
import { ConfigContext } from '../providers/config'
import { useTranslation } from 'react-i18next'

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
  /** Held assets with no ASSET_LIST row (see getUnlistedHeldAssets). */
  otherAssets?: UnlistedAsset[]
  isAssetVerified?: (assetId: string) => boolean
  onOtherAssetClick?: (assetId: string) => void
}

export default function AssetList({
  balances = [],
  onAssetClick,
  otherAssets = [],
  isAssetVerified = () => false,
  onOtherAssetClick,
}: AssetListProps) {
  const { config } = useContext(ConfigContext)
  const {t} = useTranslation()
  const { getPriceData, loading } = useContext(AssetPricesContext)

  const balancesBySymbol = Object.fromEntries(balances.map((b) => [b.symbol, b.balance])) as Partial<
    Record<AssetSymbol, number>
  >
  const homeAssetList = getHomeAssetList(balancesBySymbol)

  const getBalance = (symbol: AssetSymbol): number => {
    const found = balances.find((b) => b.symbol === symbol)
    return found?.balance || 0
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
          {t('lib.transactions.assets')}
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
          homeAssetList.map((asset, index) => {
            const symbol = asset.symbol as AssetSymbol
            const balance = getBalance(symbol)
            const priceData = getPriceData(asset.symbol)
            // No defined price means no fiat figure. CEXT is currently mapped to
            // bitcoin in lib/coingecko/mapping.ts as a placeholder, so converting
            // here would price it at bitcoin's rate — better to show nothing
            // until a real CEXT price source exists.
            const balanceFiat = asset.noMarketData ? undefined : balance * priceData.rate

            return (
              <AssetRow
                key={asset.symbol}
                symbol={asset.symbol}
                ticker={getDisplayTicker(asset.symbol)}
                name={asset.name}
                balance={balance}
                balanceFiat={balanceFiat}
                currency={config.fiat}
                percentChange={asset.noMarketData ? undefined : priceData.change}
                badge={asset.comingSoon ? 'Coming Soon' : undefined}
                onClick={!asset.comingSoon && onAssetClick ? () => onAssetClick(symbol) : undefined}
                isLast={index === homeAssetList.length - 1 && otherAssets.length === 0}
              />
            )
          })
        )}
        {/* Assets this build has no row for: anything the wallet received. Shown
            from their own metadata, with no price — there is no trusted feed for
            them, and borrowing one by ticker would let a lookalike token show a
            real token's value. */}
        {!loading
          ? otherAssets.map((asset, index) => {
              const ticker = asset.ticker ?? asset.assetId.slice(0, 6)
              return (
                <AssetRow
                  key={asset.assetId}
                  symbol={ticker}
                  ticker={ticker}
                  name={asset.name ?? truncatedAssetId(asset.assetId)}
                  balance={wrappedAmountToNumber(asset.amount, asset.decimals)}
                  unlisted={{ icon: asset.icon, decimals: asset.decimals }}
                  unverified={!isAssetVerified(asset.assetId)}
                  onClick={onOtherAssetClick ? () => onOtherAssetClick(asset.assetId) : undefined}
                  isLast={index === otherAssets.length - 1}
                />
              )
            })
          : null}
      </div>
    </div>
  )
}
