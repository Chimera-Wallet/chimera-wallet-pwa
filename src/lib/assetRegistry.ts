import type { NetworkName } from '@arkade-os/sdk'
import { getAssetRegistryUrls } from './constants'
import { getBuiltInVerifiedAssetIds, isValidAssetId } from './assets'
import { getStorageItem } from './storage'

const CACHE_TTL_MS = 60 * 60 * 1000

interface CachedRegistry {
  ids: string[]
  fetchedAt: number
}
const cacheKey = (url: string) => `assetRegistry:${url}`

export const parseRegistry = (data: unknown): string[] => {
  if (!Array.isArray(data)) throw new Error('asset registry is not an array')
  return data.filter((id): id is string => typeof id === 'string' && isValidAssetId(id)).map((id) => id.toLowerCase())
}

const readCache = (url: string): CachedRegistry | undefined =>
  getStorageItem<CachedRegistry | undefined>(cacheKey(url), undefined, (val) => {
    const parsed = JSON.parse(val)
    return Array.isArray(parsed?.ids) && typeof parsed?.fetchedAt === 'number'
      ? { ids: parseRegistry(parsed.ids), fetchedAt: parsed.fetchedAt }
      : undefined
  })

const writeCache = (url: string, ids: string[]) => {
  try {
    localStorage.setItem(cacheKey(url), JSON.stringify({ ids, fetchedAt: Date.now() }))
  } catch {
    // storage unavailable: the next call just fetches again
  }
}

const dedupe = (lists: string[][]): string[] => [...new Set(lists.flat())]

/** The last registry lists seen for a network, however old, merged; [] when none. */
export const getCachedRegistryIds = (network: NetworkName): string[] =>
  dedupe(getAssetRegistryUrls(network).map((url) => readCache(url)?.ids ?? []))

/**
 * One registry's ids. Served from cache for an hour; on a failed fetch the
 * stale cache is returned rather than nothing, so a registry outage does not
 * flip known-good assets to "Unverified".
 */
const fetchOneRegistry = async (url: string, fetchImpl: typeof fetch): Promise<string[]> => {
  const cached = readCache(url)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.ids
  try {
    const res = await fetchImpl(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const ids = parseRegistry(await res.json())
    writeCache(url, ids)
    return ids
  } catch (err) {
    if (cached) return cached.ids
    throw err
  }
}

/**
 * Registry ids for a network, merged across every configured registry. Each
 * registry is cached and falls back independently, so one being down never
 * hides the other's list; throws only when every registry failed with nothing
 * cached.
 */
export const fetchRegistryIds = async (network: NetworkName, fetchImpl: typeof fetch = fetch): Promise<string[]> => {
  const urls = getAssetRegistryUrls(network)
  if (urls.length === 0) return []
  const results = await Promise.allSettled(urls.map((url) => fetchOneRegistry(url, fetchImpl)))
  const lists = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  if (lists.length === 0) throw (results[0] as PromiseRejectedResult).reason
  return dedupe(lists)
}


/** Every id treated as verified: this build's wrapped assets plus the registries. */
export const mergeVerifiedIds = (registryIds: string[]): string[] => [
  ...new Set([...getBuiltInVerifiedAssetIds().map((id) => id.toLowerCase()), ...registryIds]),
]
