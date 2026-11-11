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
// No React in here, so it can be unit tested directly.

import {
  type WirexCard,
  type WirexWallet,
  type WirexWithdrawalRequest,
  estimateCardWithdrawal,
  executeCardWithdrawal,
  getWirexWithdrawalRequests,
} from '../../../lib/wirex'
import { finishWirexWithdrawal, withdrawFromWirexWallet, type WirexWithdrawResult } from '../../../lib/wirexWallet'
import { CARD_CURRENCY } from './lib'

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
