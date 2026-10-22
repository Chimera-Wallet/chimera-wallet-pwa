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
import bitcoinSolverCard from './bitcoin-solver.card.json'
import mutinynetSolverCard from './mutinynet-solver.card.json'
import { getSolverRegistryUrl } from './constants'
import { consoleLog } from './logs'
import { getStorageItem, readSolverCardsFromStorage } from './storage'
import { assetSwapRepository } from './swapRepository'

/**
 * Solver cards shipped with the wallet.
 *
 * Mainnet (bitcoin) ships two:
 * - Chimera's own solver, serving the `BTC/USDT` asset-swap market with the
 *   mainnet asset ids from .env.beta (production and beta both run on
 *   `bitcoin`). It carries no Lightning market.
 * - The Arkade Labs beta solver, the counterparty for the Lightning RFQ legs
 *   (`arkade:BTC <-> bolt11:BTC`). It is not published in the mainnet solver
 *   registry yet, so without it the corridor does not exist and Lightning
 *   send/receive is unavailable. Same card arkade-os/wallet ships,
 *   byte-identical: the solver's own `cli card` output, signature included.
 *
 * This client never verifies card signatures (pinning a card is the user's own
 * trust decision).
 *
 * Staging (mutinynet): the card the staging asset swaps run on — the
 * `BTC/USDT-CX`, `ETH-CX/BTC` and `ETH-CX/USDT-CX` markets, whose asset ids are
 * the staging deployment's. It carries no Lightning market: on mutinynet the
 * Lightning (and onchain) corridors come from the solver registry, as in
 * arkade-os/wallet, which bundles nothing for this network.
 *
 * Each card is scoped to its own network on purpose: a card's pubkey and relay
 * belong to one deployment, and offering it on another network would quote
 * that counterparty for the wrong coins. Bundled rather than configured
 * because a card carries its own rendezvous (pubkey + nostr relays) — there is
 * no URL to point at.
 */
// Exported so the Solvers settings screen can show built-in cards — a pinned
// solver invisible in Settings reads as "no solver at all".
export const BUNDLED_CARDS: LocalCardInput[] = [
  { card: bitcoinSolverCard as LocalCardInput['card'], network: 'bitcoin' },
  { card: betaSolverCard as LocalCardInput['card'], network: 'bitcoin' },
  { card: mutinynetSolverCard as LocalCardInput['card'], network: 'mutinynet' },
]

const BUNDLED_PUBKEYS = new Set(
  BUNDLED_CARDS.map((input) => (input.card as { discovery_pubkey?: string }).discovery_pubkey?.toLowerCase()).filter(
    (pubkey): pubkey is string => Boolean(pubkey),
  ),
)

/** Whether a solver discovery pubkey belongs to a card shipped with the build. */
export const isBundledPubkey = (pubkey: string | undefined): boolean =>
  Boolean(pubkey && BUNDLED_PUBKEYS.has(pubkey.toLowerCase()))

/**
 * Where a market's solver came from. Registry and bundled solvers are the
 * trusted defaults; `custom` is a card the user added themselves, which the
 * wallet still uses but labels — Chimera has not vouched for it.
 *
 * Bundled and user cards both arrive as `sourceType: 'local'`, so the bundled
 * ones are told apart by discovery pubkey.
 */
export type SolverOrigin = 'registry' | 'bundled' | 'custom'

export const getSolverOrigin = (market: Pick<DiscoveredMarket, 'sourceType' | 'discovery_pubkey'>): SolverOrigin => {
  if (market.sourceType === 'registry') return 'registry'
  return isBundledPubkey(market.discovery_pubkey) ? 'bundled' : 'custom'
}

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
