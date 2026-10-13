import type { NetworkName } from '@arkade-os/sdk'
import { getAssetRegistryUrl } from './constants'
import { getBuiltInVerifiedAssetIds, isValidAssetId } from './assets'
import { getStorageItem } from './storage'

const CACHE_TTL_MS = 60 * 60 * 1000

interface CachedRegistry {
  ids: string[]
  fetchedAt: number
}

const cacheKey = (network: NetworkName) => `assetRegistry:${network}`

export const parseRegistry = (data: unknown): string[] => {
  if (!Array.isArray(data)) throw new Error('asset registry is not an array')
  return data.filter((id): id is string => typeof id === 'string' && isValidAssetId(id)).map((id) => id.toLowerCase())
}

const readCache = (network: NetworkName): CachedRegistry | undefined =>
  getStorageItem<CachedRegistry | undefined>(cacheKey(network), undefined, (val) => {
    const parsed = JSON.parse(val)
    return Array.isArray(parsed?.ids) && typeof parsed?.fetchedAt === 'number'
      ? { ids: parseRegistry(parsed.ids), fetchedAt: parsed.fetchedAt }
      : undefined
  })

const writeCache = (network: NetworkName, ids: string[]) => {
  try {
    localStorage.setItem(cacheKey(network), JSON.stringify({ ids, fetchedAt: Date.now() }))
  } catch {
    // storage unavailable: the next call just fetches again
  }
}

/** The last registry list seen for a network, however old; [] when none. */
export const getCachedRegistryIds = (network: NetworkName): string[] => readCache(network)?.ids ?? []

/**
 * Registry ids for a network. Served from cache for an hour; on a failed fetch
 * the stale cache is returned rather than nothing, so a registry outage does
 * not flip known-good assets to "Unverified".
 */
export const fetchRegistryIds = async (network: NetworkName, fetchImpl: typeof fetch = fetch): Promise<string[]> => {
  const cached = readCache(network)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.ids
  const url = getAssetRegistryUrl(network)
  if (!url) return cached?.ids ?? []
  try {
    const res = await fetchImpl(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const ids = parseRegistry(await res.json())
    writeCache(network, ids)
    return ids
  } catch (err) {
    if (cached) return cached.ids
    throw err
  }
}

/** Every id treated as verified: this build's wrapped assets plus the registry. */
export const mergeVerifiedIds = (registryIds: string[]): string[] => [
  ...new Set([...getBuiltInVerifiedAssetIds().map((id) => id.toLowerCase()), ...registryIds]),
]
