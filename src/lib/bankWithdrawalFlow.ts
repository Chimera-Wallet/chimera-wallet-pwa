/**
 * Crypto -> fiat bank withdrawal: register the order and fund it from the
 * wallet. Shared by BankSend and the POS app's fiat payouts so both go through
 * the same provider switch (providers/bankTransfer) and the same crash-safe
 * bookkeeping (lib/bankWithdrawalAttempt).
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
import { consoleError } from './logs'

// Legacy Chimera withdrawals use this shared funding wallet. Ramp orders return
// the address to fund instead. It is the same for every ramp order, so ramp
// only credits the deposit once told the funding txid (reportFunding).
const COMPANY_WALLET = import.meta.env.VITE_BANK_WITHDRAW_WALLET as string

const TERMINAL_STATUSES = ['COMPLETED', 'FAILED', 'REJECTED', 'EXPIRED', 'REFUNDED']

/** The legacy provider needs VITE_BANK_WITHDRAW_WALLET and it isn't set. */
export class WithdrawalWalletNotConfiguredError extends Error {
  constructor() {
    super('Bank withdrawal wallet is not configured')
    this.name = 'WithdrawalWalletNotConfiguredError'
  }
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

  // Funded but not credited: the earlier report may not have got through.
  if (pending.fundingState === 'funded' && pending.txid) {
    const credited = await reportFunding(pending.order.id, pending.txid)
    if (credited && credited.status !== 'WAITING_FOR_DEPOSIT') {
      clearPendingBankWithdrawal()
      return { kind: 'progressed', order: credited }
    }
  }

  return { kind: 'awaiting', order, fundingState: pending.fundingState }
}

/**
 * Report the funding txid so the provider credits the order. Never throws: the
 * funds have already left the wallet, so a failed report must not read as a
 * failed withdrawal. The pending slot keeps the txid for the next attempt.
 */
const reportFunding = async (orderId: string, txid: string): Promise<BankOrder | undefined> => {
  try {
    if (getBankTransferProvider() !== 'ramp') return
    return await reportBankWithdrawalFunding(orderId, txid)
  } catch (err) {
    consoleError(err, `Reporting the funding of bank withdrawal ${orderId} failed`)
  }
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
 * Create the withdrawal order and send `amountSats` to its funding address.
 * Throws if the order can't be created or the payment fails; the pending slot
 * then still records the attempt so it can't be silently started twice.
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
  // The legacy provider is funded through a configured shared wallet — fail
  // before registering an order that could never be funded.
  if (getBankTransferProvider() === 'chimera' && !COMPANY_WALLET) throw new WithdrawalWalletNotConfiguredError()

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

  onOrderCreated?.(order)
  addOrderToHistory(order, 'send', circuit)

  savePendingBankWithdrawal({ order, fundingAddress, amountSats, fundingState: 'funding' })
  onFunding?.()
  const txid = await sendOffChain(svcWallet, amountSats, fundingAddress)
  savePendingBankWithdrawal({ order, fundingAddress, amountSats, fundingState: 'funded', txid })
  await reportFunding(order.id, txid)

  return order
}
