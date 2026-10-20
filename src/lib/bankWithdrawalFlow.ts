/**
 * Crypto -> fiat bank withdrawal: register the order and fund it from the
 * wallet. Shared by BankSend and the POS app's fiat payouts so both go through
 * the same provider switch (providers/bankTransfer) and the same crash-safe
 * bookkeeping (lib/bankWithdrawalAttempt, lib/bankDepositReports).
 */

import type { IWallet } from '@arkade-os/sdk'
import {
  createBankWithdraw,
  getBankOrderStatus,
  getBankTransferProvider,
  reportBankWithdrawalFunding,
  type BankOrder,
} from '../providers/bankTransfer'
import { decodeArkAddress } from './address'
import { sendOffChain } from './asp'
import { addOrderToHistory } from './bankOrderHistory'
import type { BankCircuit, BankCurrency, BankData } from './bankTransferConfig'
import {
  clearPendingBankWithdrawal,
  getPendingBankWithdrawal,
  savePendingBankWithdrawal,
  type BankWithdrawalFundingState,
} from './bankWithdrawalAttempt'
import { addUnreportedBankDeposit, getUnreportedBankDeposits, removeUnreportedBankDeposit } from './bankDepositReports'
import { consoleError } from './logs'

// Legacy Chimera withdrawals use this shared funding wallet. Ramp orders return
// the address to fund instead. It is the same for every ramp order, so ramp
// only credits the deposit once told the funding txid (reportFunding).
const COMPANY_WALLET = import.meta.env.VITE_BANK_WITHDRAW_WALLET as string

// Ramp keeps the `crypto_amount` of its open off-ramp orders unique per asset,
// so one order's deposit can't be claimed by another. When the requested
// amount is taken it lowers the order's amount by a few base units — never by
// more than this — and only credits a deposit of exactly the order's amount.
const RAMP_MAX_AMOUNT_ADJUSTMENT_SATS = 1000

const TERMINAL_STATUSES = ['COMPLETED', 'FAILED', 'REJECTED', 'EXPIRED', 'REFUNDED']

// The order ended without crediting a deposit. If it was in fact funded, a
// person has to sort it out: reporting it anyway lets ramp alert its operators.
const ENDED_UNCREDITED_STATUSES = ['EXPIRED', 'REJECTED', 'FAILED']

/** The legacy provider needs VITE_BANK_WITHDRAW_WALLET and it isn't set. */
export class WithdrawalWalletNotConfiguredError extends Error {
  constructor() {
    super('Bank withdrawal wallet is not configured')
    this.name = 'WithdrawalWalletNotConfiguredError'
  }
}

/**
 * A decimal BTC amount string ("0.00012345") as integer sats, without going
 * through floats. Undefined unless it's a plain non-negative decimal with no
 * non-zero digits past the 8th decimal that fits a safe integer.
 */
export const btcAmountToSats = (amount: string | null | undefined): number | undefined => {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(amount?.trim() ?? '')
  if (!match) return
  const [, whole, fraction = ''] = match
  if (/[^0]/.test(fraction.slice(8))) return
  const sats = Number(`${whole}${fraction.slice(0, 8).padEnd(8, '0')}`)
  return Number.isSafeInteger(sats) ? sats : undefined
}

/**
 * The amount ramp will credit for `order`, checked against the `requestedSats`
 * it was created with. Throws, before anything is paid, unless it's within
 * ramp's documented adjustment.
 */
const rampFundingSats = (order: BankOrder, requestedSats: number): number => {
  if (order.direction !== 'offramp') {
    throw new Error(`Ramp returned a ${order.direction} order ${order.id} for a withdrawal. Nothing was sent.`)
  }
  const sats = btcAmountToSats(order.crypto_amount)
  if (sats === undefined || sats <= 0) {
    throw new Error(`Ramp returned an invalid amount (${order.crypto_amount}) for order ${order.id}. Nothing was sent.`)
  }
  if (sats > requestedSats || sats < requestedSats - RAMP_MAX_AMOUNT_ADJUSTMENT_SATS) {
    throw new Error(
      `Ramp asked for ${sats} sats on order ${order.id} instead of the ${requestedSats} requested. Nothing was sent.`,
    )
  }
  return sats
}

// Logging writes to localStorage too, so it can itself throw (quota, corrupt
// logs). Once funds have moved, that must not surface as a failure.
const logQuietly = (err: unknown, message: string): void => {
  try {
    consoleError(err, message)
  } catch {
    // nowhere left to report it
  }
}

/**
 * Report the funding txid so the provider credits the order, and drop it from
 * the unreported list once that got through. Never throws: the funds have
 * already left the wallet, so a failed report must not read as a failed
 * withdrawal — the entry stays listed for retryUnreportedBankDeposits.
 */
const reportFunding = async (orderId: string, txid: string): Promise<BankOrder | undefined> => {
  try {
    const order = await reportBankWithdrawalFunding(orderId, txid)
    removeUnreportedBankDeposit(orderId)
    return order
  } catch (err) {
    logQuietly(err, `Reporting the funding of bank withdrawal ${orderId} failed`)
  }
}

let retrying: Promise<void> | undefined

/**
 * Report every funding txid still listed as unreported (lib/bankDepositReports).
 * An entry is dropped once its order no longer waits for a deposit, or once
 * it's past the list's max age. Never throws; overlapping calls share one run.
 */
export const retryUnreportedBankDeposits = (): Promise<void> => {
  retrying ??= (async () => {
    for (const { orderId, txid } of getUnreportedBankDeposits()) {
      try {
        const { status } = await getBankOrderStatus(orderId, 'offramp')
        if (status === 'WAITING_FOR_DEPOSIT') {
          await reportFunding(orderId, txid)
          continue
        }
        if (ENDED_UNCREDITED_STATUSES.includes(status)) await reportFunding(orderId, txid)
        removeUnreportedBankDeposit(orderId)
      } catch (err) {
        logQuietly(err, `Checking the unreported funding of bank withdrawal ${orderId} failed`)
      }
    }
  })()
    .catch(() => undefined)
    .finally(() => {
      retrying = undefined
    })
  return retrying
}

export type PendingWithdrawalResolution =
  /** Nothing was pending. */
  | { kind: 'none' }
  /** The previous order reached a terminal state; the slot was cleared. */
  | { kind: 'settled'; order: BankOrder }
  /** The previous order moved past WAITING_FOR_DEPOSIT; the slot was cleared. */
  | { kind: 'progressed'; order: BankOrder }
  /** The previous order is still WAITING_FOR_DEPOSIT. */
  | { kind: 'awaiting'; order: BankOrder; fundingState: BankWithdrawalFundingState }

/**
 * Check the previous withdrawal recorded in the pending slot, if any.
 * A `funding` state means the app stopped between creating the order and
 * confirming the payment, so it is unknown whether funds left the wallet.
 */
export const resolvePendingBankWithdrawal = async (): Promise<PendingWithdrawalResolution> => {
  const pending = getPendingBankWithdrawal()
  if (!pending) return { kind: 'none' }

  const order = await getBankOrderStatus(pending.order.id, 'offramp')

  if (TERMINAL_STATUSES.includes(order.status)) {
    clearPendingBankWithdrawal()
    return { kind: 'settled', order }
  }

  if (order.status !== 'WAITING_FOR_DEPOSIT') {
    clearPendingBankWithdrawal()
    return { kind: 'progressed', order }
  }

  // Funded but not credited: the earlier report may not have got through. Make
  // sure it's listed as unreported, so it keeps being retried in the
  // background once this slot is reused, and try it now.
  if (pending.fundingState === 'funded' && pending.txid) {
    addUnreportedBankDeposit(pending.order.id, pending.txid)
    const credited = await reportFunding(pending.order.id, pending.txid)
    if (credited && credited.status !== 'WAITING_FOR_DEPOSIT') {
      clearPendingBankWithdrawal()
      return { kind: 'progressed', order: credited }
    }
  }

  return { kind: 'awaiting', order, fundingState: pending.fundingState }
}

export interface FundBankWithdrawalInput {
  svcWallet: IWallet
  /** The connected Ark server's signer pubkey (aspInfo.signerPubkey). */
  signerPubkey: string
  asset: string
  currency: BankCurrency
  circuit: BankCircuit
  bankData?: BankData
  amountSats: number
  email: string
  /** Called once the order exists, before any funds move. */
  onOrderCreated?: (order: BankOrder) => void
  /** Called right before the funding payment is sent. */
  onFunding?: () => void
}

/**
 * Create the withdrawal order and fund it: with `amountSats` on the legacy
 * provider, with the order's own amount on ramp (which may be slightly lower,
 * see RAMP_MAX_AMOUNT_ADJUSTMENT_SATS).
 * Throws if the order can't be created or the payment fails; the pending slot
 * then still records the attempt so it can't be silently started twice.
 * Returns the order as the provider last reported it.
 */
export const fundBankWithdrawal = async ({
  svcWallet,
  signerPubkey,
  asset,
  currency,
  circuit,
  bankData,
  amountSats,
  email,
  onOrderCreated,
  onFunding,
}: FundBankWithdrawalInput): Promise<BankOrder> => {
  const provider = getBankTransferProvider()
  // The legacy provider is funded through a configured shared wallet — fail
  // before registering an order that could never be funded.
  if (provider === 'chimera' && !COMPANY_WALLET) throw new WithdrawalWalletNotConfiguredError()

  const { order, depositCryptoAddress } = await createBankWithdraw({
    asset,
    fiatCurrency: currency,
    email,
    cryptoAmountSats: amountSats,
    circuit,
    bankData,
  })

  const fundingAddress = depositCryptoAddress ?? COMPANY_WALLET
  if (depositCryptoAddress) {
    const { serverPubKey } = decodeArkAddress(depositCryptoAddress)
    if (serverPubKey !== signerPubkey.slice(-64).toLowerCase()) {
      throw new Error('Ramp returned a deposit address for a different Ark server')
    }
  }

  // Ramp credits only a payment of exactly the order's amount
  const fundingSats = provider === 'ramp' ? rampFundingSats(order, amountSats) : amountSats

  onOrderCreated?.(order)
  addOrderToHistory(order, 'send', circuit)

  savePendingBankWithdrawal({ order, fundingAddress, amountSats: fundingSats, fundingState: 'funding' })
  onFunding?.()
  const txid = await sendOffChain(svcWallet, fundingSats, fundingAddress)
  // Listed before reporting, so the txid survives a failed report and the
  // pending slot being reused by the next withdrawal.
  addUnreportedBankDeposit(order.id, txid)
  savePendingBankWithdrawal({ order, fundingAddress, amountSats: fundingSats, fundingState: 'funded', txid })
  const credited = await reportFunding(order.id, txid)

  return credited ?? order
}
