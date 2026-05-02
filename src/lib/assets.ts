// Asset configuration for use throughout the application
// Colors defined in ionic.css as CSS variables (--asset-*)

export interface AssetConfig {
  symbol: string
  name: string
  color: string // CSS variable name (without var())
  precision: number
  comingSoon?: boolean
}

export const ASSETS = {
  BTC: {
    symbol: 'BTC',
    name: 'Bitcoin',
    color: 'asset-btc',
    precision: 8,
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether',
    color: 'asset-usdt',
    precision: 6,
  },
  ETH: {
    symbol: 'ETH',
    name: 'Ethereum',
    color: 'asset-eth',
    precision: 18,
  },
  TRX: {
    symbol: 'TRX',
    name: 'TRON',
    color: 'asset-trx',
    precision: 6,
  },
  MATIC: {
    symbol: 'POL',
    name: 'Polygon',
    color: 'asset-matic',
    precision: 18,
  },
  CEXT: {
    symbol: 'CEXT',
    name: 'Chimera',
    color: 'asset-cext',
    precision: 18,
    comingSoon: true,
  },
} as const

export type AssetSymbol = keyof typeof ASSETS

// TEMPORARY: Only show BTC
export const ASSET_LIST: AssetConfig[] = [ASSETS.BTC, ASSETS.CEXT]
// export const ASSET_LIST: AssetConfig[] = Object.values(ASSETS)

export const getAssetConfig = (symbol: string): AssetConfig | undefined => {
  return ASSETS[symbol.toUpperCase() as AssetSymbol]
}

export const getAssetColor = (symbol: string): string => {
  return getAssetConfig(symbol)?.color || 'grey'
}
