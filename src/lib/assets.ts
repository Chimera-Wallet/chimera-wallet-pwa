// Asset configuration for use throughout the application
// Colors defined as CSS variables (--asset-*) in tokens.css

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
  POL: {
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

// The single list of assets the wallet offers. Everything user-facing reads
// from here — the home list, the send/receive asset pickers and the balances
// computed for them — so an asset is shown everywhere or nowhere.
//
// BTC uses the Ark/Lightning/Bitcoin flows; the others are bridged to/from
// their native chains via the Arkade Wrap API. ETH, TRX and POL stay defined in
// ASSETS above (so existing balances, transactions and price lookups still
// resolve by symbol) but are deliberately absent here and therefore hidden.
export const ASSET_LIST: AssetConfig[] = [ASSETS.BTC, ASSETS.USDT, ASSETS.CEXT]

// Assets the fiat bank transfer (on/off-ramp) flow is offered for. Every other
// asset can only be moved over Arkade or its native chain.
const BANK_TRANSFER_SYMBOLS: AssetSymbol[] = ['BTC', 'USDT']

/** Whether the bank transfer flow should be offered for an asset symbol. */
export const assetSupportsBankTransfer = (symbol: string): boolean => {
  return BANK_TRANSFER_SYMBOLS.includes(symbol.toUpperCase() as AssetSymbol)
}

/** Assets selectable inside the bank transfer (on/off-ramp) screens. */
export const BANK_TRANSFER_ASSET_LIST: AssetConfig[] = ASSET_LIST.filter((asset) =>
  assetSupportsBankTransfer(asset.symbol),
)

export const getAssetConfig = (symbol: string): AssetConfig | undefined => {
  return ASSETS[symbol.toUpperCase() as AssetSymbol]
}

/** Like `getAssetConfig` but throws a descriptive error if the symbol is not found. */
export const requireAssetConfig = (symbol: string): AssetConfig => {
  const config = getAssetConfig(symbol)
  if (!config) throw new Error(`Unknown asset symbol: "${symbol}"`)
  return config
}

export const getAssetColor = (symbol: string): string => {
  return getAssetConfig(symbol)?.color || 'grey'
}

// Arkade wrapped asset IDs per symbol. These are environment-specific (staging
// vs production) and are provided via VITE_ARKADE_* env vars. BTC is native and
// has no wrapped asset.
const WRAPPED_ASSET_IDS: Partial<Record<AssetSymbol, string | undefined>> = {
  ETH: import.meta.env.VITE_ARKADE_ETH,
  USDT: import.meta.env.VITE_ARKADE_USDT,
  TRX: import.meta.env.VITE_ARKADE_TRX,
  POL: import.meta.env.VITE_ARKADE_POL,
  CEXT: import.meta.env.VITE_ARKADE_CEXT,
}

/** The Arkade wrapped asset ID for a symbol, or undefined if not wrapped/unset. */
export const getWrappedAssetId = (symbol: string): string | undefined => {
  return WRAPPED_ASSET_IDS[symbol.toUpperCase() as AssetSymbol]
}

/** Reverse lookup: the app symbol for a given Arkade wrapped asset ID. */
export const getAssetSymbolByAssetId = (assetId: string): AssetSymbol | undefined => {
  for (const [symbol, id] of Object.entries(WRAPPED_ASSET_IDS)) {
    if (id && id === assetId) return symbol as AssetSymbol
  }
  return undefined
}

/**
 * Display ticker for a symbol: wrapped Arkade assets are shown as `<SYMBOL>-CX`
 * (e.g. ETH -> ETH-CX). Native assets (BTC) keep their plain symbol.
 */
export const getDisplayTicker = (symbol: string): string => {
  const upper = symbol.toUpperCase()
  return getWrappedAssetId(upper) ? `${upper}-CX` : upper
}

import Decimal from 'decimal.js'

/** Convert a base-unit asset amount to a human-readable number using its decimals. */
export const wrappedAmountToNumber = (amount: bigint, decimals: number): number => {
  return new Decimal(amount.toString()).div(Decimal.pow(10, decimals)).toNumber()
}

export const MAX_DECIMALS = 8 // Arbitrary value to allow at least 1 sat/asset

export function isValidAssetId(id: string) {
  return /^[0-9a-fA-F]{68}$/.test(id)
}

export const isValidDecimals = (d: number): boolean => Number.isInteger(d) && d >= 0 && d <= MAX_DECIMALS

export function unitsToCents(units: string, decimals = MAX_DECIMALS): bigint {
  if (!units || units === '') return BigInt(0)
  if (!isValidDecimals(decimals)) return BigInt(units)
  const [integer, fraction = ''] = units.split('.')
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals)
  return BigInt(integer + paddedFraction) // string + string
}

export function centsToUnits(cents: bigint, decimals = MAX_DECIMALS): string {
  if (!isValidDecimals(decimals)) return cents.toString()
  if (cents < BigInt(Number.MAX_SAFE_INTEGER) && cents > BigInt(Number.MIN_SAFE_INTEGER)) {
    const str = Decimal.div(cents, Decimal.pow(10, decimals)).toFixed(decimals)
    return str.includes('.') ? str.replace(/\.?0+$/, '') : str // remove trailing zeros and optional dot
  }
  return (cents / BigInt(10) ** BigInt(decimals)).toString() // TODO: prevent truncation
}

export const truncatedAssetId = (id: string): string => {
  if (!id || id.length < 24) return ''
  return `${id.slice(0, 12)}...${id.slice(-12)}`
}

const hideDots = (value: bigint): string => {
  const str = value.toString()
  const length = str.length * 2 > 6 ? str.length * 2 : 6
  return '-�'.repeat(length)
}

export const prettyAssetAmountHide = (value: bigint, suffix: string): string => {
  if (!value) return ''
  const dots = hideDots(value)
  return suffix ? `${dots} ${suffix}` : dots
}

export const prettyAssetNumber = (num?: string | number, maximumFractionDigits = MAX_DECIMALS): string => {
  if (num === undefined || num === null) return '0'
  if (typeof num === 'number') num = num.toString()
  let [integer, fraction = ''] = num.split('.')
  integer = integer.replace(/[^0-9-]+/g, '') // remove non-digit and non-negative sign characters
  const negative = integer === '-0'
  const paddedFraction = fraction
    .padEnd(MAX_DECIMALS, '0') // fill with zeros to ensure consistent formatting
    .slice(0, maximumFractionDigits) // slice to the desired number of decimals
    .replace(/0+$/, '') // remove trailing zeros
    .replace(/\.$/, '') // if the number ends with a dot, remove it
  return `${negative ? '-' : ''}${BigInt(integer).toLocaleString()}${paddedFraction ? `.${paddedFraction}` : ''}`
}

export const prettyAssetAmount = (cents: bigint, decimals: number, tidy = false): string => {
  const realDecimals = isValidDecimals(decimals) ? decimals : 0

  if (!tidy) return prettyAssetNumber(centsToUnits(cents, realDecimals), realDecimals)

  const billion = 10 ** 9
  const million = 10 ** 6
  const thousand = 10 ** 3
  const trillion = 10 ** 12
  const tenthousand = 10 ** 4
  const strUnits = centsToUnits(cents, realDecimals)

  const safeToUseNumber = cents < BigInt(Number.MAX_SAFE_INTEGER) && cents > BigInt(Number.MIN_SAFE_INTEGER)

  if (safeToUseNumber) {
    const units = Number(centsToUnits(cents, realDecimals))
    const absoluteUnits = units < 0 ? -units : units
    if (absoluteUnits >= trillion) {
      return `${prettyAssetNumber(units / trillion, 0)}T`
    } else if (absoluteUnits >= billion) {
      return `${prettyAssetNumber(units / billion, 0)}B`
    } else if (absoluteUnits >= million) {
      return `${prettyAssetNumber(units / million, 0)}M`
    } else if (absoluteUnits >= tenthousand) {
      return `${prettyAssetNumber(units / thousand, 0)}K`
    } else {
      return `${prettyAssetNumber(units, realDecimals)}`
    }
  }

  // For very large numbers that exceed JavaScript's safe integer range, we fall back to bigint
  // Due to truncation in bigint division, we won't get decimal places, but this is a rare edge case
  // and still provides a readable format
  const units = BigInt(Math.trunc(Number(strUnits)))
  const absoluteUnits = units < 0 ? -units : units

  if (absoluteUnits >= trillion) {
    return `${prettyAssetNumber((units / BigInt(trillion)).toString(), 2)}T`
  } else if (absoluteUnits >= billion) {
    return `${prettyAssetNumber((units / BigInt(billion)).toString(), 2)}B`
  } else if (absoluteUnits >= million) {
    return `${prettyAssetNumber((units / BigInt(million)).toString(), 2)}M`
  } else if (absoluteUnits >= tenthousand) {
    return `${prettyAssetNumber((units / BigInt(thousand)).toString(), 2)}K`
  } else {
    return `${prettyAssetNumber(strUnits, 0)}`
  }
}
