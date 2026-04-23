import type { CoinGeckoAssetID } from './api'
import { ASSETS, type AssetSymbol } from '../assets'
import { FIATS, type FiatSymbol } from '../fiatConfig'

export interface AssetMapping {
  symbol: string
  coingeckoId: CoinGeckoAssetID
  name: string
  precision?: number
  requiresSpecialHandling?: boolean
}

// Map asset symbols to CoinGecko IDs
const CRYPTO_COINGECKO_ID_MAP: Record<AssetSymbol, CoinGeckoAssetID> = {
  BTC: 'bitcoin',
  USDT: 'tether',
  ETH: 'ethereum',
  TRX: 'tron',
  MATIC: 'matic-network',
}

// Map fiat currency symbols to CoinGecko IDs
const FIAT_COINGECKO_ID_MAP: Record<FiatSymbol, CoinGeckoAssetID> = {
  CHF: 'chf',
  EUR: 'eur',
  USD: 'usd',
}

// Build asset mappings from ASSETS config
const CRYPTO_ASSET_MAPPINGS: AssetMapping[] = Object.values(ASSETS).map((asset) => ({
  symbol: asset.symbol,
  coingeckoId: CRYPTO_COINGECKO_ID_MAP[asset.symbol as AssetSymbol],
  name: asset.name,
  precision: asset.precision,
}))

// Build fiat currency mappings from FIATS config
const FIAT_MAPPINGS: AssetMapping[] = Object.values(FIATS).map((fiat) => ({
  symbol: fiat.symbol,
  coingeckoId: FIAT_COINGECKO_ID_MAP[fiat.symbol as FiatSymbol],
  name: fiat.name,
  precision: fiat.precision,
  requiresSpecialHandling: true,
}))

export const ASSET_COINGECKO_MAPPING: AssetMapping[] = [...CRYPTO_ASSET_MAPPINGS, ...FIAT_MAPPINGS]

// Create a map for quick lookup by symbol
export const SYMBOL_TO_MAPPING_MAP = new Map<string, AssetMapping>(
  ASSET_COINGECKO_MAPPING.map((mapping) => [mapping.symbol, mapping]),
)

/**
 * Get CoinGecko ID for a given symbol
 */
export function getCoingeckoIdForSymbol(symbol: string): CoinGeckoAssetID | null {
  const mapping = SYMBOL_TO_MAPPING_MAP.get(symbol.toUpperCase())
  return mapping ? mapping.coingeckoId : null
}

/**
 * Get asset mapping for a given symbol or identifier
 */
export function getAssetMapping(identifier: string): AssetMapping | null {
  // Try exact symbol match first
  const bySymbol = SYMBOL_TO_MAPPING_MAP.get(identifier.toUpperCase())
  if (bySymbol) return bySymbol

  // Try by CoinGecko ID
  return ASSET_COINGECKO_MAPPING.find((m) => m.coingeckoId === identifier) || null
}

/**
 * Get unique CoinGecko IDs from a list of identifiers
 */
export function getUniqueCoingeckoIds(identifiers: string[]): CoinGeckoAssetID[] {
  const ids = new Set<CoinGeckoAssetID>()

  for (const identifier of identifiers) {
    const id = getCoingeckoIdForSymbol(identifier)
    if (id && !requiresSpecialHandling(identifier)) {
      ids.add(id)
    }
  }

  return Array.from(ids)
}

/**
 * Check if an asset requires special handling (e.g., fiat currencies)
 */
export function requiresSpecialHandling(identifier: string): boolean {
  const mapping = getAssetMapping(identifier)
  return mapping?.requiresSpecialHandling || false
}

/**
 * Get all supported asset symbols
 */
export function getSupportedSymbols(): string[] {
  return ASSET_COINGECKO_MAPPING.map((m) => m.symbol)
}
