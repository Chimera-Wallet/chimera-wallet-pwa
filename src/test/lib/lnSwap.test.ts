import { describe, it, expect } from 'vitest'
import type { DiscoveredMarket } from '@arkade-os/solver-discovery'
import { discoverMarkets } from '@arkade-os/swap'
import { BUNDLED_CARDS } from '../../lib/swapMarkets'
import { lnReceiveRendezvous, lnSendRendezvous } from '../../lib/lnSwap'
import { getEmulatorPubkeyForNetwork } from '../../lib/constants'

// Discovery over the bundled cards plus a mocked registry index (empty unless
// given), so the result is what the build ships with, whatever is live today.
const bundledMarkets = (
  network: 'bitcoin' | 'mutinynet',
  registry: { markets: unknown[]; solvers: unknown[] } = { markets: [], solvers: [] },
): Promise<DiscoveredMarket[]> =>
  discoverMarkets({
    network,
    registryUrl: 'https://registry.test/index.json',
    localCards: BUNDLED_CARDS.filter((c) => c.network === network),
    fetchImpl: async () =>
      new Response(JSON.stringify({ version: 0, network, generated_at: Math.floor(Date.now() / 1000), commit: '0'.repeat(40), ...registry })),
  })

// The mutinynet registry's Lightning solver as published, legacy
// `quote_corridor` form.
const registrySolver = {
  name: 'ln-solver-mutinynet',
  discovery_pubkey: '3f831510a6d7678d0c90d7d6fbc4057720517e2e30681ef4c87cc57aaf57e8d5',
  transports: { nostr: { relays: ['wss://nostr.arkade.sh'] } },
}
const registryLightningMarket = {
  pair: 'BTC/lightning:BTC',
  base_asset: { id: 'btc', name: 'Bitcoin', ticker: 'BTC', decimals: 8 },
  quote_asset: { id: 'btc', name: 'Bitcoin', ticker: 'BTC', decimals: 8 },
  quote_corridor: 'lightning',
  fee_bps: 30,
  min_base_amount: '1000',
  max_base_amount: '50000',
  min_quote_amount: '1000',
  max_quote_amount: '25000',
  solver: registrySolver.name,
  discovery_pubkey: registrySolver.discovery_pubkey,
  transports: registrySolver.transports,
}

describe('bundled solver cards', () => {
  it('ships the asset-swap and Lightning cards on bitcoin, one card on mutinynet', () => {
    expect(BUNDLED_CARDS.map((c) => c.network).sort()).toEqual(['bitcoin', 'bitcoin', 'mutinynet'])
  })

  it('resolves the beta solver card (asset-id form, no quote_corridor) for mainnet Lightning send and receive', async () => {
    const markets = await bundledMarkets('bitcoin')
    const pin = getEmulatorPubkeyForNetwork('bitcoin')
    const betaPubkey = '66422c952f8dcb96e4d0c3f049cd1e265b8461b916d9913c65c2494b64b4e3ce'

    const send = lnSendRendezvous(markets, pin)
    expect(send).toMatchObject({ minSats: 500, maxSats: 100_000, transports: { nostr: { relays: ['wss://nostr.arkade.sh'] } } })
    expect(send?.solverPubkey).toBe(betaPubkey)

    const receive = lnReceiveRendezvous(markets, pin)
    expect(receive).toMatchObject({ minSats: 500, maxSats: 100_000 })
    expect(receive?.solverPubkey).toBe(betaPubkey)
  })

  it('offers the mainnet BTC/USDT market from the bitcoin card beside the Lightning market', async () => {
    const markets = await bundledMarkets('bitcoin')
    expect(markets.map((m) => m.base_asset.ticker + '/' + m.quote_asset.ticker).sort()).toEqual(['BTC/BTC', 'BTC/d4e095d6'])
  })

  it('bundles no Lightning corridor for mutinynet: it comes from the registry', async () => {
    const pin = getEmulatorPubkeyForNetwork('mutinynet')
    expect(lnSendRendezvous(await bundledMarkets('mutinynet'), pin)).toBeUndefined()

    const markets = await bundledMarkets('mutinynet', { markets: [registryLightningMarket], solvers: [registrySolver] })
    expect(lnSendRendezvous(markets, pin)).toMatchObject({ solverPubkey: registryLightningMarket.discovery_pubkey, minSats: 1000, maxSats: 25_000 })
    expect(lnReceiveRendezvous(markets, pin)).toMatchObject({ minSats: 1000, maxSats: 50_000 })
  })

  it('never treats an asset market as a Lightning corridor', async () => {
    const markets = (await bundledMarkets('mutinynet')).filter((m) => m.quote_asset.ticker !== 'BTC')
    expect(markets.length).toBeGreaterThan(0)
    expect(lnSendRendezvous(markets, getEmulatorPubkeyForNetwork('mutinynet'))).toBeUndefined()
  })
})
