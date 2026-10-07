/**
 * Wallet-side market discovery: the parts `@arkade-os/swap` deliberately does
 * not own — which registry to ask, which cards ship with the build, and the
 * pre-fee rate the swap composer displays.
 */
import { discoverMarkets as discover } from '@arkade-os/swap'
import {
  displayPrice,
  isNetwork,
  type DiscoveredMarket,
  type LocalCardInput,
  type OfferPlan,
} from '@arkade-os/solver-discovery'
import type { NetworkName } from '@arkade-os/sdk'
import betaSolverCard from './beta-solver.card.json'
import { getSolverRegistryUrl } from './constants'
import { consoleLog } from './logs'
import { getStorageItem, readSolverCardsFromStorage } from './storage'
import { assetSwapRepository } from './swapRepository'

/**
 * Solver cards shipped with the wallet.
 *
 * One card, one solver, multiple markets: the Arkade Labs solver behind
 * `discovery_pubkey`/`transports.nostr.relays` here serves both the asset-swap
 * corridors (`BTC/USDT-CX`, `ETH-CX/BTC`, `ETH-CX/USDT-CX`) and the Lightning
 * RFQ send leg (`arkade:BTC -> lightning:BTC`). None of it is published in the
 * solver registry yet, so without this bundle none of these corridors exist
 * for this wallet. Bundled rather than configured because the card carries its
 * own rendezvous (pubkey + nostr relays) — there is no URL to point at.
 *
 * The card is the solver's own `cli card` output, signature included — it
 * signs the current `transports.nostr.relays` shape. This client never
 * verifies the signature (pinning a card is the user's own trust decision),
 * but carrying the real one keeps the bundle byte-identical to what the
 * registry will list.
 *
 * Offered on both production (bitcoin) and staging (mutinynet). Not on
 * regtest/signet, where no wallet build points.
 */
// Exported so the Solvers settings screen can show built-in cards — a pinned
// solver invisible in Settings reads as "no solver at all".
export const BUNDLED_CARDS: LocalCardInput[] = (['bitcoin', 'mutinynet'] as const).map((network) => ({
  card: betaSolverCard as LocalCardInput['card'],
  network,
}))

// Short, stable hash of the local cards. The package's markets cache is keyed
// by network + registry only, so without this a changed card set (a new build
// shipping a new bundled card) would keep serving stale markets for an hour.
const cardsFingerprint = (cards: LocalCardInput[]): string => {
  const text = JSON.stringify(cards)
  let hash = 5381
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0
  return (hash >>> 0).toString(36)
}

const cardsFingerprintKey = (network: string) => `solverCardsFingerprint:${network}`

/**
 * Markets from the network's solver registry; [] when none is configured.
 * Caching (one hour, with a stale fallback for an unreachable registry) lives
 * in the repository the package writes through; a change in the local card
 * set bypasses it.
 */
export const discoverMarkets = async (network: NetworkName, useCache = true): Promise<DiscoveredMarket[]> => {
  if (!isNetwork(network)) return []
  const localCards = [...BUNDLED_CARDS, ...readSolverCardsFromStorage()].filter((c) => c.network === network)
  const fingerprint = cardsFingerprint(localCards)
  const cardsChanged = getStorageItem(cardsFingerprintKey(network), '', (val) => val) !== fingerprint
  const markets = await discover({
    network,
    registryUrl: getSolverRegistryUrl(network),
    repository: assetSwapRepository,
    localCards,
    logger: (...args) => consoleLog('solver discovery:', ...args),
    useCache: useCache && !cardsChanged,
  })
  try {
    localStorage.setItem(cardsFingerprintKey(network), fingerprint)
  } catch {
    // storage unavailable: the next call just skips the cache again
  }
  return markets
}

/** The market feed's pre-fee price oriented give→receive, in whole display
 * units. Derived from the plan's exact price rational — plan.priceDisplay
 * truncates at 8 fraction digits, which zeroes or skews small prices, and the
 * give-quote inversion would amplify that loss. Assumes the wallet's
 * safetyBps of 0 (QUOTE_OPTIONS): fee_bps is then the only gap between this
 * rate and the plan's net payout. */
export const preFeeDisplayRate = (plan: OfferPlan): number => {
  const { num, den } = displayPrice(plan.price, {
    baseDecimals: plan.market.base_asset.decimals,
    quoteDecimals: plan.market.quote_asset.decimals,
  })
  const rate = plan.give === 'base' ? Number(num) / Number(den) : Number(den) / Number(num)
  return Number.isFinite(rate) && rate > 0 ? rate : 0
}
