import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fetchRegistryIds, getCachedRegistryIds, mergeVerifiedIds, parseRegistry } from '../../lib/assetRegistry'

const ID_A = 'ab'.repeat(34)
const ID_B = 'CD'.repeat(34)

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

  it('fetches the mainnet list for the bitcoin network', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse([ID_A]))
    expect(await fetchRegistryIds('bitcoin', fetchImpl)).toEqual([ID_A])
    expect(fetchImpl).toHaveBeenCalledWith('https://arklabshq.github.io/asset-registry/mainnet.json')
    expect(getCachedRegistryIds('bitcoin')).toEqual([ID_A])
  })

  it('serves a fresh cache without refetching', async () => {
    await fetchRegistryIds('mutinynet', vi.fn().mockResolvedValue(okResponse([ID_A])))
    const fetchImpl = vi.fn()
    expect(await fetchRegistryIds('mutinynet', fetchImpl)).toEqual([ID_A])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('falls back to a stale cache when the fetch fails', async () => {
    localStorage.setItem('assetRegistry:bitcoin', JSON.stringify({ ids: [ID_A], fetchedAt: 0 }))
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'))
    expect(await fetchRegistryIds('bitcoin', fetchImpl)).toEqual([ID_A])
  })

  it('throws when the fetch fails and nothing is cached', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response)
    await expect(fetchRegistryIds('bitcoin', fetchImpl)).rejects.toThrow('HTTP 503')
    expect(getCachedRegistryIds('bitcoin')).toEqual([])
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
