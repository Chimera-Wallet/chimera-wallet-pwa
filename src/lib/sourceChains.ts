// Source-chain configuration for the Arkade Wrap (Typhoon) bridge.
//
// Non-BTC assets can be received/sent on their native EVM/TRON chain. When a
// native chain is chosen, the Arkade Wrap API is used to wrap (native -> Arkade)
// or unwrap (Arkade -> native) the asset. This module is the client-side asset
// registry that decides which chains are offered per asset and which `ticker`
// value is sent to the API.

export type SourceChainId = 'ethereum' | 'tron' | 'polygon'

export interface SourceChain {
  /** Chain id as expected by the Arkade Wrap API `chain` field. */
  id: SourceChainId
  /** Human-readable chain name. */
  name: string
  /** Icon path in the public folder. */
  icon: string
  /** Placeholder for the source/destination address input. */
  addressPlaceholder: string
  /** Validates an address on this chain. */
  isValidAddress: (address: string) => boolean
}

const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/
const TRON_ADDRESS_REGEX = /^T[1-9A-HJ-NP-Za-km-z]{33}$/

export const SOURCE_CHAINS: Record<SourceChainId, SourceChain> = {
  ethereum: {
    id: 'ethereum',
    name: 'Ethereum',
    icon: '/images/asset_logos/ETH.svg',
    addressPlaceholder: 'Paste Ethereum (0x) address',
    isValidAddress: (a) => EVM_ADDRESS_REGEX.test(a.trim()),
  },
  tron: {
    id: 'tron',
    name: 'Tron',
    icon: '/images/asset_logos/TRX.svg',
    addressPlaceholder: 'Paste Tron (T) address',
    isValidAddress: (a) => TRON_ADDRESS_REGEX.test(a.trim()),
  },
  polygon: {
    id: 'polygon',
    name: 'Polygon',
    icon: '/images/asset_logos/POL.svg',
    addressPlaceholder: 'Paste Polygon (0x) address',
    isValidAddress: (a) => EVM_ADDRESS_REGEX.test(a.trim()),
  },
}

export interface AssetChainOption {
  /** The source chain the asset can be bridged over. */
  chain: SourceChain
  /** Asset ticker to send to the Arkade Wrap API for this chain. */
  ticker: string
}

// Which native chains each asset can be wrapped/unwrapped over. Assets keyed by
// their display `symbol` (see ASSETS in ./assets). Assets not listed here (BTC,
// CEXT) are not bridged through the Arkade Wrap API.
export const ASSET_SOURCE_CHAINS: Record<string, AssetChainOption[]> = {
  ETH: [{ chain: SOURCE_CHAINS.ethereum, ticker: 'ETH' }],
  USDT: [
    { chain: SOURCE_CHAINS.ethereum, ticker: 'USDT' },
    { chain: SOURCE_CHAINS.tron, ticker: 'USDT' },
  ],
  TRX: [{ chain: SOURCE_CHAINS.tron, ticker: 'TRX' }],
  POL: [{ chain: SOURCE_CHAINS.polygon, ticker: 'POL' }],
}

/** Native-chain options available for an asset symbol (empty if not bridged). */
export const getSourceChains = (symbol: string): AssetChainOption[] => {
  return ASSET_SOURCE_CHAINS[symbol.toUpperCase()] ?? []
}

/** Whether an asset can be bridged to/from a native chain via Arkade Wrap. */
export const assetSupportsWrap = (symbol: string): boolean => {
  return getSourceChains(symbol).length > 0
}

/** Find the chain/ticker option for an asset on a given chain. */
export const getAssetChainOption = (
  symbol: string,
  chainId: SourceChainId,
): AssetChainOption | undefined => {
  return getSourceChains(symbol).find((o) => o.chain.id === chainId)
}

/** Like `getAssetChainOption` but throws if the combination is not registered. */
export const requireAssetChainOption = (symbol: string, chainId: SourceChainId): AssetChainOption => {
  const option = getAssetChainOption(symbol, chainId)
  if (!option) throw new Error(`No chain option for asset "${symbol}" on chain "${chainId}"`)
  return option
}

/** Like `SOURCE_CHAINS[id]` but throws a descriptive error if the id is not registered. */
export const requireSourceChain = (id: SourceChainId): SourceChain => {
  const chain = SOURCE_CHAINS[id]
  if (!chain) throw new Error(`Unknown source chain id: "${id}"`)
  return chain
}
