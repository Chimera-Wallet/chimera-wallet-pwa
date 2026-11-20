// Everything marked PLACEHOLDER is something the designs show but that either
// isn't specified yet or has no backing endpoint in lib/wirex.ts.

import { sleep } from './sleep'
import {
  type WirexCard,
  type WirexWallet,
  type WirexWithdrawalRequest,
  estimateCardWithdrawal,
  executeCardWithdrawal,
  getWirexCards,
  getWirexWithdrawalRequests,
  setWirexCardBlocked,
} from './wirex'
import { finishWirexWithdrawal, withdrawFromWirexWallet, type WirexWithdrawResult } from './wirexWallet'

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

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

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

export const getSelectableCards = (cards: WirexCard[]): WirexCard[] => cards.filter((c) => c.status !== 'Closed')

export const pickActiveCard = (cards: WirexCard[], preferredId?: string | null): WirexCard | undefined => {
  const selectable = getSelectableCards(cards)
  return selectable.find((c) => c.id === preferredId) ?? selectable[0]
}

const SELECTED_CARD_KEY = 'wirexSelectedCardId'

export const readSelectedCardId = (): string | null => {
  try {
    return localStorage.getItem(SELECTED_CARD_KEY)
  } catch {
    return null
  }
}

export const storeSelectedCardId = (cardId: string) => {
  try {
    localStorage.setItem(SELECTED_CARD_KEY, cardId)
  } catch {
  }
}

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

export const lockWirexCard = async (userAddress: string, card: WirexCard, lock: boolean): Promise<WirexCard> => {
  await setWirexCardBlocked(userAddress, card.id, lock)
  const fresh = ((await getWirexCards(userAddress))?.data ?? []).find((c) => c.id === card.id)
  return fresh && (fresh.status === 'Blocked') === lock ? fresh : { ...card, status: lock ? 'Blocked' : 'Active' }
}

/** Base block explorer link for a payout / withdrawal tx. */
export const baseTxUrl = (hash: string) =>
  `${import.meta.env.VITE_WIREX_SDK_ENV === 'prod' ? 'https://basescan.org' : 'https://sepolia.basescan.org'}/tx/${hash}`

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

/** deposit = top-up, payment = card spend, withdraw = move back to the wallet. */
export type WirexCardTxType = 'deposit' | 'payment' | 'withdraw' | 'swap'

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

// Withdrawal
//
// Move Wirex card balance out to a Base address (v1: the user's own EVM signer
// address, the first hop towards USDT-CX on Ark; see the plan's blockers).
//
//   Leg 0 (Gen1 cards only): card balance -> Wirex wallet, via the card
//          withdraw estimate/execute API.
//   Leg 1: Wirex wallet WUSD -> unwrapped base token (USDC) -> recipient, via
//          the SDK. Time-locked by Wirex's Execution Delay Policy: the promise
//          stays pending until the delay passes.
//
// Pending time-locked requests are read back from Wirex
// (GET /api/v1/withdrawal/requests), not stored locally, so a withdrawal whose
// tab was closed mid-delay can be finished from any device.

/** Whether the card holds its own balance (Gen1) that must be withdrawn to the wallet first. */
export const cardHoldsBalance = (card: WirexCard): boolean => (card.balances ?? []).some((b) => b.balance > 0)

export type WithdrawStep = 'card' | 'delay'

export interface RunWithdrawalParams {
  password: string
  userAddress: string
  card: WirexCard
  wallet: WirexWallet
  /** Base address receiving the unwrapped base token. */
  recipient: `0x${string}`
  /** Decimal amount in CARD_CURRENCY (WUSD is 1:1 USD). */
  amount: number
  onStep?: (step: WithdrawStep) => void
}

/**
 * Withdraw `amount` from the card to `recipient`. Resolves once the
 * time-locked on-chain transfer has executed (after Wirex's delay).
 */
export const runWirexWithdrawal = async ({
  password,
  userAddress,
  card,
  wallet,
  recipient,
  amount,
  onStep,
}: RunWithdrawalParams): Promise<WirexWithdrawResult> => {
  if (!(amount > 0)) throw new Error('Amount must be greater than zero')

  if (cardHoldsBalance(card)) {
    onStep?.('card')
    const estimate = await estimateCardWithdrawal({
      userAddress,
      cardId: card.id,
      amount,
      currency: CARD_CURRENCY,
      destinationAddress: wallet.wallet_address,
      correlationId: crypto.randomUUID(),
    })
    if (!estimate) throw new Error('Wirex did not return a card withdrawal estimate')
    await executeCardWithdrawal(userAddress, card.id, estimate.estimation_id)
  }

  onStep?.('delay')
  return withdrawFromWirexWallet(password, { recipient, amount })
}

/** Ms until a time-locked request can be executed (0 when it's already due). */
export const msUntilDue = (request: WirexWithdrawalRequest, now = Date.now()): number => {
  const due = new Date(request.valid_after).getTime()
  return Number.isFinite(due) ? Math.max(0, due - now) : 0
}

/** Withdrawals requested on-chain that haven't executed yet. Errors read as none. */
export const getPendingWirexWithdrawals = async (userAddress: string): Promise<WirexWithdrawalRequest[]> => {
  try {
    return await getWirexWithdrawalRequests(userAddress)
  } catch {
    return []
  }
}

/** Execute a previously requested withdrawal once its delay has passed. */
export const finishPendingWirexWithdrawal = async (
  password: string,
  request: WirexWithdrawalRequest,
): Promise<`0x${string}`> => {
  const wait = msUntilDue(request)
  if (wait > 0) throw new Error(`This withdrawal can be completed in ${Math.ceil(wait / 60_000)} min`)
  return finishWirexWithdrawal(password, request.call_data)
}
