import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { BUNDLED_CARDS, getSolverOrigin, isBundledPubkey } from '../../lib/swapMarkets'

const bundledPubkey = (BUNDLED_CARDS[0].card as { discovery_pubkey: string }).discovery_pubkey

describe('getSolverOrigin', () => {
  it('treats registry markets as registry', () => {
    expect(getSolverOrigin({ sourceType: 'registry', discovery_pubkey: 'aa' })).toBe('registry')
  })

  it('recognises bundled cards by discovery pubkey', () => {
    expect(isBundledPubkey(bundledPubkey.toUpperCase())).toBe(true)
    expect(getSolverOrigin({ sourceType: 'local', discovery_pubkey: bundledPubkey })).toBe('bundled')
  })

  it('labels any other local card as custom', () => {
    expect(getSolverOrigin({ sourceType: 'local', discovery_pubkey: 'ff'.repeat(32) })).toBe('custom')
    expect(getSolverOrigin({ sourceType: 'local', discovery_pubkey: undefined })).toBe('custom')
  })
})

describe('BUNDLED_CARDS', () => {
  const read = (file: string) => fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8')
  const arkadeIds = (...files: string[]) =>
    new Set(files.flatMap((file) => [...read(file).matchAll(/^VITE_ARKADE_[A-Z]+=(\S+)$/gm)].map((m) => m[1])))
  const cardFor = (network: string) =>
    BUNDLED_CARDS.find((c) => c.network === network)?.card as {
      discovery_pubkey: string
      markets: { base_asset: { id: string }; quote_asset: { id: string } }[]
    }
  const assetIds = (network: string) =>
    cardFor(network)
      .markets.flatMap((m) => [m.base_asset.id, m.quote_asset.id])
      .filter((id) => id !== 'btc')

  it('ships one card per network', () => {
    expect(BUNDLED_CARDS.map((c) => c.network).sort()).toEqual(['bitcoin', 'mutinynet'])
  })

  it('treats every bundled card as bundled', () => {
    for (const { card } of BUNDLED_CARDS) {
      expect(isBundledPubkey((card as { discovery_pubkey: string }).discovery_pubkey)).toBe(true)
    }
  })

  // Beta is production plus .env.beta's overrides; the mainnet ids live there until launch.
  it('uses mainnet asset ids on bitcoin', () => {
    const ids = arkadeIds('.env.production', '.env.beta')
    for (const id of assetIds('bitcoin')) expect(ids).toContain(id)
  })

  it('uses staging asset ids on mutinynet', () => {
    const ids = arkadeIds('.env.staging')
    for (const id of assetIds('mutinynet')) expect(ids).toContain(id)
  })
})
