export const WALLET_CACHE_PREFIX = 'chimera-wallet-cache-'

export const isWalletCache = (name: string): boolean => name.startsWith(WALLET_CACHE_PREFIX)
