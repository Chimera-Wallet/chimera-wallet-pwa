import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { DiscoveredMarket } from '@arkade-os/solver-discovery'
import { BTC_ASSET_ID } from '@arkade-os/swap'
import { BUNDLED_CARDS, getSolverOrigin, isBundledPubkey, withWalletAssetIds } from '../../lib/swapMarkets'

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
  const cardsFor = (network: string) =>
    BUNDLED_CARDS.filter((c) => c.network === network).map(
      (c) =>
        c.card as {
          discovery_pubkey: string
          markets: { base_asset: { id: string }; quote_asset: { id: string } }[]
        },
    )
  // Cards spell assets either bare (`btc`, `<hex>`) or CAIP-style
  // (`arkade:bitcoin/slip44:0`, `arkade:bitcoin/asset:<hex>`); compare the hex.
  const assetIds = (network: string) =>
    cardsFor(network)
      .flatMap((card) => card.markets)
      .flatMap((m) => [m.base_asset.id, m.quote_asset.id])
      .filter((id) => id !== 'btc' && !id.includes('/slip44:'))
      .map((id) => id.replace(/^[a-z0-9]+:[a-z]+\/asset:/, ''))

  it('ships the asset-swap and Lightning cards on bitcoin, one card on mutinynet', () => {
    expect(BUNDLED_CARDS.map((c) => c.network).sort()).toEqual(['bitcoin', 'bitcoin', 'mutinynet'])
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

describe('withWalletAssetIds', () => {
  const side = (id: string) => ({ id, name: 'x', ticker: 'x', decimals: 8 })
  const market = (base: string, quote: string) =>
    ({ base_asset: side(base), quote_asset: side(quote) }) as unknown as DiscoveredMarket
  const usdt = 'd4e095d6e9003607655a65936057a4db37e9cf2b3003d522ea121df5793f76a00000'

  it('rewrites CAIP-style Arkade ids to the wallet form', () => {
    const out = withWalletAssetIds(market('arkade:bitcoin/slip44:0', `arkade:bitcoin/asset:${usdt}`))
    expect(out.base_asset.id).toBe(BTC_ASSET_ID)
    expect(out.quote_asset.id).toBe(usdt)
    expect(withWalletAssetIds(market('arkade:mutinynet/slip44:1', 'btc')).base_asset.id).toBe(BTC_ASSET_ID)
  })

  it('leaves bare ids and other corridors alone', () => {
    const out = withWalletAssetIds(market('btc', usdt))
    expect([out.base_asset.id, out.quote_asset.id]).toEqual(['btc', usdt])
    expect(withWalletAssetIds(market('btc', 'bolt11:bitcoin/slip44:0')).quote_asset.id).toBe('bolt11:bitcoin/slip44:0')
  })

  it('maps every mainnet card asset onto a .env.beta id or BTC', () => {
    const read = (file: string) => fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8')
    const ids = new Set([...read('.env.beta').matchAll(/^VITE_ARKADE_[A-Z]+=(\S+)$/gm)].map((m) => m[1]))
    ids.add(BTC_ASSET_ID)
    const card = BUNDLED_CARDS.find((c) => c.card && (c.card as { name: string }).name === 'my-solver')!.card as {
      markets: DiscoveredMarket[]
    }
    for (const m of card.markets.map(withWalletAssetIds)) {
      expect(ids).toContain(m.base_asset.id)
      expect(ids).toContain(m.quote_asset.id)
    }
  })
})
