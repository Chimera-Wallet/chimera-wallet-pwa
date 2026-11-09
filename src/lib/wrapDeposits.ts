/**
 * Bridge (Arkade Wrap) deposits the wallet is waiting on.
 *
 * A wrap is paid on another chain (e.g. USDT on Ethereum) and only reaches the
 * wallet as an Arkade transaction once the bridge mints it, so the transaction
 * list used to show nothing between the user's deposit and completion. Each
 * wrap quote is recorded here when it's created, kept current by
 * providers/wrapDepositTracking (whatever screen is showing), and shown in the
 * list as a pending row from the moment the bridge sees the deposit until the
 * minted asset arrives.
 *
 * Stored locally like tx notes and bank order history — not in Config, which is
 * backed up to Nostr. Reads go through a cache keyed on the raw stored string,
 * so screens can subscribe with useSyncExternalStore.
 */

import { getWrapQuote, isTerminalWrapStatus, type WrapQuote } from './arkadeWrap'
import { getWrappedAssetId } from './assets'
import { consoleError } from './logs'
import type { Tx } from './types'

const STORAGE_KEY = 'wrap_deposits'

// Long enough to show a failed deposit for a while and to outlive any quote's
// expiry; short enough that the list doesn't grow without bound.
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000

export interface WrapDeposit {
  /** App asset symbol the deposit mints, e.g. 'USDT'. */
  assetSymbol: string
  /** When the quote was created, in milliseconds. */
  createdAt: number
  quote: WrapQuote
}

type Listener = () => void
const listeners = new Set<Listener>()

export const subscribeWrapDeposits = (listener: Listener): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const parse = (raw: string | null): WrapDeposit[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

let cache: { raw: string | null; deposits: WrapDeposit[] } = { raw: null, deposits: [] }

export const getWrapDeposits = (): WrapDeposit[] => {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw !== cache.raw) cache = { raw, deposits: parse(raw) }
  return cache.deposits
}

export const getWrapDeposit = (quoteId: string | undefined): WrapDeposit | undefined =>
  quoteId ? getWrapDeposits().find((deposit) => deposit.quote.id === quoteId) : undefined

const write = (deposits: WrapDeposit[]): void => {
  const raw = JSON.stringify(deposits)
  localStorage.setItem(STORAGE_KEY, raw)
  cache = { raw, deposits }
  listeners.forEach((l) => l())
}

/** Record a newly created quote, or refresh the stored copy of a known one. */
export const saveWrapDeposit = (deposit: WrapDeposit): void => {
  const others = getWrapDeposits().filter((d) => d.quote.id !== deposit.quote.id)
  write([deposit, ...others])
}

const updateQuote = (quote: WrapQuote): void => {
  const deposits = getWrapDeposits()
  if (!deposits.some((d) => d.quote.id === quote.id)) return
  write(deposits.map((d) => (d.quote.id === quote.id ? { ...d, quote } : d)))
}

/** Whether the bridge has seen funds arrive for this quote. */
const depositSeen = (quote: WrapQuote): boolean =>
  Boolean(quote.deposit_tx_hash || quote.amount) || quote.status === 'deposited' || quote.status === 'processing'

let refreshing: Promise<void> | undefined

/**
 * Poll every quote still in flight and drop records past retention. Cheap when
 * nothing is in flight: it reads the list and stops. A call made while one is
 * still running joins it rather than polling again.
 */
export const refreshWrapDeposits = (now = Date.now()): Promise<void> => {
  if (refreshing) return refreshing
  refreshing = (async () => {
    const all = getWrapDeposits()
    const kept = all.filter((d) => now - d.createdAt < RETENTION_MS)
    if (kept.length !== all.length) write(kept)
    const inFlight = kept.filter((d) => !isTerminalWrapStatus(d.quote.status))
    await Promise.all(
      inFlight.map((d) =>
        getWrapQuote(d.quote.id)
          .then(updateQuote)
          .catch((err) => consoleError(err, 'error polling wrap quote')),
      ),
    )
  })().finally(() => {
    refreshing = undefined
  })
  return refreshing
}

/**
 * The transaction-list row for a deposit, or undefined when there is nothing to
 * show: no deposit seen yet (the user may never send one), or completed (the
 * minted asset now shows as a regular transaction).
 */
export const wrapDepositToTx = (deposit: WrapDeposit): Tx | undefined => {
  const { quote } = deposit
  if (quote.status === 'completed' || !depositSeen(quote)) return undefined
  return buildWrapTx(deposit)
}

/** A deposit as a Tx whatever its status, for a detail screen that opened it
 * while pending and should follow it to completion. */
export const buildWrapTx = (deposit: WrapDeposit): Tx | undefined => {
  const { quote } = deposit
  const assetId = getWrappedAssetId(deposit.assetSymbol)
  if (!assetId) return undefined
  // Wrapped assets map 1-to-1 with the original, so the bridge's base units
  // are the Arkade amount (see wrappedAmountToNumber).
  const units = quote.payout_amount ?? quote.amount ?? '0'
  let amount: bigint
  try {
    amount = BigInt(units)
  } catch {
    amount = BigInt(0)
  }
  return {
    amount: 0,
    assets: [{ assetId, amount }],
    boardingTxid: '',
    createdAt: Math.floor(deposit.createdAt / 1000),
    explorable: undefined,
    preconfirmed: false,
    redeemTxid: '',
    roundTxid: '',
    settled: false,
    type: 'received',
    wrap: { chain: quote.chain, quoteId: quote.id, status: quote.status },
  }
}

/** Rows for every deposit worth showing, newest first. */
export const getWrapDepositTxs = (deposits: WrapDeposit[]): Tx[] =>
  deposits.map(wrapDepositToTx).filter((tx): tx is Tx => Boolean(tx))
