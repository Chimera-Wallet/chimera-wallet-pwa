// Shared helpers for the Wirex card screens (shown in place of the card
// reservation app when VITE_WIREX_ENABLED is 'true' — see providers/navigation.tsx).
//
// Self-contained on purpose, like the Settings > Wirex (dev) page: it talks to
// ../../../lib/wirex directly rather than through WirexProvider, which can't
// load an already-registered user.
//
// Everything marked PLACEHOLDER is something the designs show but that either
// isn't specified yet or has no backing endpoint in lib/wirex.ts.

import { WirexCard, WirexWallet } from '../../../lib/wirex'

// Address persistence

// The signer address isn't secret; remembering it lets the card screen reload
// the account without asking for the password.
const ADDRESS_KEY = 'wirexUserAddress'
// Written by the Settings > Wirex (dev) page — read as a fallback so an account
// created there shows up here straight away.
const DEV_ADDRESS_KEY = 'wirexDevUserAddress'

export const readWirexAddress = (): string | null => {
  try {
    return localStorage.getItem(ADDRESS_KEY) ?? localStorage.getItem(DEV_ADDRESS_KEY)
  } catch {
    return null
  }
}

export const storeWirexAddress = (address: string) => {
  try {
    localStorage.setItem(ADDRESS_KEY, address)
  } catch {
    // non-fatal
  }
}

// Retry (copied from the dev page)

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Errors that no amount of waiting will fix — fail straight away on these.
const PERMANENT_ERRORS = [
  'Invalid residence country',
  'ErrorAlreadyExists',
  'Missing VITE_',
  'Invalid Wirex company id',
]
const isPermanent = (err: unknown) => PERMANENT_ERRORS.some((p) => errorText(err).includes(p))

/**
 * Wirex lags behind the chain and behind its own writes, so idempotent steps
 * are retried with a growing delay instead of failing on the first attempt.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts, delayMs, onRetry }: { attempts: number; delayMs: number; onRetry: (msg: string) => void },
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= attempts || isPermanent(err)) throw err
      const wait = delayMs * attempt
      onRetry(`attempt ${attempt}/${attempts} failed (${errorText(err)}), retrying in ${wait / 1000}s…`)
      await sleep(wait)
    }
  }
}

// Card helpers

/** PLACEHOLDER: the design shows a single card — use the first one that isn't closed. */
export const pickActiveCard = (cards: WirexCard[]): WirexCard | undefined => cards.find((c) => c.status !== 'Closed')

/** PLACEHOLDER: USD is assumed as the card currency throughout. */
export const CARD_CURRENCY = 'USD'

/** Number of decimals the amount input accepts for the card currency. */
export const CARD_DECIMALS = 2

/**
 * Wirex's unified-balance token for USD. Cards are funded from the unified
 * balance (WUSD/WEUR), which deposited USDC/USDT/EURC are converted into —
 * docs.wirexapp.com/docs/retail-unified-balance.
 */
const CARD_BALANCE_TOKEN = 'WUSD'

/**
 * The card's spendable balance: the WUSD balance on the user's Wirex wallet
 * (GET /api/v1/wallet). Raw USDT/USDC sitting in the wallet isn't counted.
 * PLACEHOLDER: WEUR is ignored while USD is the only card currency.
 */
export const getWirexCardBalance = (wallet: WirexWallet | null): number =>
  (wallet?.balances ?? [])
    .filter((b) => b.token_symbol.toUpperCase() === CARD_BALANCE_TOKEN)
    .reduce((sum, b) => sum + (Number(b.balance) || 0), 0)

/* eslint-disable @typescript-eslint/no-unused-vars -- placeholder stubs keep their final signatures */

/**
 * PLACEHOLDER: masked PAN isn't modelled (PCI — see lib/wirex.ts), so the
 * card's last 4 digits are unknown.
 */
export const getCardLast4 = (_card: WirexCard): string | undefined => undefined

export interface WirexToken {
  symbol: string
  /** Undefined for the placeholder token — transfers are disabled without it. */
  address?: string
  balance: number
}

/**
 * Tokens that can be moved to/from the card. Sourced from the Wirex wallet's
 * balances; PLACEHOLDER fallback is a USDT entry with no address.
 */
export const getWirexTokens = (wallet: WirexWallet | null): WirexToken[] => {
  const tokens = (wallet?.balances ?? []).map((b) => ({
    symbol: b.token_symbol.toUpperCase(),
    address: b.token_address,
    balance: Number(b.balance) || 0,
  }))
  return tokens.length ? tokens : [{ symbol: 'USDT', address: undefined, balance: 0 }]
}

// Placeholder API stubs (no endpoint in lib/wirex.ts yet)

export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not available yet`)
    this.name = 'NotImplementedError'
  }
}

/** PLACEHOLDER: no block/unblock card endpoint in lib/wirex.ts. */
export const lockWirexCard = async (_userAddress: string, _cardId: string, _lock: boolean): Promise<void> => {
  throw new NotImplementedError('Locking the card')
}

export type WirexCardTxType = 'withdraw' | 'deposit' | 'swap'

export interface WirexCardTx {
  id: string
  type: WirexCardTxType
  title: string
  /** Unix ms. */
  date: number
  status: 'Confirmed' | 'Pending' | 'Failed'
  /** Signed amount in `currency`. */
  amount: number
  currency: string
  /** Signed fiat value in CARD_CURRENCY. */
  fiatAmount?: number
}

/** PLACEHOLDER: no card transactions endpoint in lib/wirex.ts — always empty. */
export const getWirexCardTransactions = async (_userAddress: string, _cardId: string): Promise<WirexCardTx[]> => []

/* eslint-enable @typescript-eslint/no-unused-vars */
