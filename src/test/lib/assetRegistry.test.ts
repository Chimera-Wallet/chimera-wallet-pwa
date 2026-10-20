import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchRegistryIds, getCachedRegistryIds, mergeVerifiedIds, parseRegistry } from '../../lib/assetRegistry'

const ID_A = 'ab'.repeat(34)
const ID_B = 'CD'.repeat(34)

const ARKADE_MAINNET = 'https://arklabshq.github.io/asset-registry/mainnet.json'
const CHIMERA_URL = 'https://chimera.example/registry.json'

const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response

describe('parseRegistry', () => {
  it('keeps valid asset ids, lowercased', () => {
    expect(parseRegistry([ID_A, ID_B])).toEqual([ID_A, ID_B.toLowerCase()])
  })

  it('drops malformed entries', () => {
    expect(parseRegistry([ID_A, 'not-hex', 42, null, 'ab'.repeat(33)])).toEqual([ID_A])
  })

  it('rejects a non-array payload', () => {
    expect(() => parseRegistry({ ids: [ID_A] })).toThrow()
  })
})

describe('fetchRegistryIds', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('fetches the mainnet list for the bitcoin network', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse([ID_A]))
    expect(await fetchRegistryIds('bitcoin', fetchImpl)).toEqual([ID_A])
    expect(fetchImpl).toHaveBeenCalledWith(ARKADE_MAINNET)
    expect(getCachedRegistryIds('bitcoin')).toEqual([ID_A])
  })

  it('serves a fresh cache without refetching', async () => {
    await fetchRegistryIds('mutinynet', vi.fn().mockResolvedValue(okResponse([ID_A])))
    const fetchImpl = vi.fn()
    expect(await fetchRegistryIds('mutinynet', fetchImpl)).toEqual([ID_A])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('falls back to a stale cache when the fetch fails', async () => {
    localStorage.setItem(`assetRegistry:${ARKADE_MAINNET}`, JSON.stringify({ ids: [ID_A], fetchedAt: 0 }))
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'))
    expect(await fetchRegistryIds('bitcoin', fetchImpl)).toEqual([ID_A])
  })

  it('throws when the fetch fails and nothing is cached', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response)
    await expect(fetchRegistryIds('bitcoin', fetchImpl)).rejects.toThrow('HTTP 503')
    expect(getCachedRegistryIds('bitcoin')).toEqual([])
  })

  it('merges the Arkade and Chimera registries without duplicates', async () => {
    vi.stubEnv('VITE_CHIMERA_ASSET_REGISTRY_URL', CHIMERA_URL)
    const fetchImpl = vi.fn((url: string) =>
      Promise.resolve(okResponse(url === CHIMERA_URL ? [ID_A, ID_B] : [ID_A])),
    ) as unknown as typeof fetch
    expect(await fetchRegistryIds('bitcoin', fetchImpl)).toEqual([ID_A, ID_B.toLowerCase()])
    expect(fetchImpl).toHaveBeenCalledWith(ARKADE_MAINNET)
    expect(fetchImpl).toHaveBeenCalledWith(CHIMERA_URL)
    expect(getCachedRegistryIds('bitcoin')).toEqual([ID_A, ID_B.toLowerCase()])
  })

  it("keeps one registry's ids when the other fails", async () => {
    vi.stubEnv('VITE_CHIMERA_ASSET_REGISTRY_URL', CHIMERA_URL)
    const fetchImpl = vi.fn((url: string) =>
      url === CHIMERA_URL ? Promise.reject(new Error('offline')) : Promise.resolve(okResponse([ID_A])),
    ) as unknown as typeof fetch
    expect(await fetchRegistryIds('bitcoin', fetchImpl)).toEqual([ID_A])
  })

  it('lets the env override the Arkade registry', async () => {
    vi.stubEnv('VITE_ARKADE_ASSET_REGISTRY_URL', 'https://arkade.example/registry.json')
    const fetchImpl = vi.fn().mockResolvedValue(okResponse([ID_A]))
    await fetchRegistryIds('bitcoin', fetchImpl)
    expect(fetchImpl).toHaveBeenCalledWith('https://arkade.example/registry.json')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('returns [] for a network with no registry', async () => {
    const fetchImpl = vi.fn()
    expect(await fetchRegistryIds('regtest', fetchImpl)).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('mergeVerifiedIds', () => {
  it("always includes this build's wrapped asset ids", () => {
    const ids = mergeVerifiedIds([])
    expect(ids).toEqual(expect.arrayContaining(['test-usdt', 'test-cext']))
  })

  it('adds registry ids without duplicates', () => {
    const ids = mergeVerifiedIds([ID_A, ID_A])
    expect(ids.filter((id) => id === ID_A)).toHaveLength(1)
  })
})
