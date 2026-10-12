/**
 * Fiat payout for a POS sale: once the customer's BTC has arrived, withdraw
 * that amount to the merchant's saved bank account. This is the same rail as
 * a manual BankSend (lib/bankWithdrawalFlow), just triggered by the sale.
 *
 * If anything fails, the BTC simply stays in the wallet and the payment's
 * conversion is marked failed so it can be retried from the status page.
 *
 * Conversions run one at a time: each withdrawal goes through the single
 * pending-withdrawal slot (lib/bankWithdrawalAttempt) that guards against
 * paying an order twice, and two at once would overwrite each other's entry.
 */

import type { ServiceWorkerWallet } from '@arkade-os/sdk'
import { getBankOrderStatus } from '../providers/bankTransfer'
import { getPendingBankWithdrawal } from './bankWithdrawalAttempt'
import { fundBankWithdrawal, resolvePendingBankWithdrawal } from './bankWithdrawalFlow'
import { getUserEmailForBankTransfer } from './kyc'
import { extractError } from './error'
import { consoleError } from './logs'
import { getPosPayment, getPosPayments, getPosSettings, isFiatPayout, updatePosPayment, type PosPayment } from './pos'

// Conversions queued or running in this session. A payment whose stored
// conversion says 'converting' but isn't in here was interrupted (app closed).
const running = new Set<string>()
let queue: Promise<unknown> = Promise.resolve()

/** A stored 'converting' state with nothing running behind it. */
export const isConversionInterrupted = (payment: PosPayment): boolean =>
  payment.conversion?.status === 'converting' && !running.has(payment.id)

export interface ConvertPosPaymentDeps {
  svcWallet: ServiceWorkerWallet
  /** The connected Ark server's signer pubkey (aspInfo.signerPubkey). */
  signerPubkey: string
}

const ENDED_UNPAID = ['FAILED', 'REJECTED', 'REFUNDED']

/**
 * A previous attempt for this sale already registered `orderId`. Work out
 * whether that order was funded, so a retry never pays the same sale out twice:
 * 'paid-out' when it was, 'retry' when it lapsed unfunded. Throws when it can't
 * be told apart — the merchant has to check the order.
 */
const reconcileOrder = async (orderId: string): Promise<'paid-out' | 'retry'> => {
  const order = await getBankOrderStatus(orderId, 'offramp')
  if (order.status === 'EXPIRED') return 'retry'
  if (ENDED_UNPAID.includes(order.status)) {
    throw new Error(`Payout order ${orderId} ended as ${order.status}. Check it in the bank order history.`)
  }
  if (order.status !== 'WAITING_FOR_DEPOSIT') return 'paid-out'

  const pending = getPendingBankWithdrawal()
  if (pending?.order.id === orderId && pending.fundingState === 'funded') return 'paid-out'
  throw new Error(
    `Payout order ${orderId} is still waiting for its deposit and it isn't known whether it was sent. Check it in the bank order history.`,
  )
}

const convertNow = async (paymentId: string, deps: ConvertPosPaymentDeps): Promise<PosPayment | undefined> => {
  const payment = getPosPayment(paymentId)
  if (!payment || payment.status !== 'completed' || !isFiatPayout(payment.payoutCurrency)) return payment
  if (payment.conversion?.status === 'submitted') return payment

  const currency = payment.payoutCurrency
  const setConversion = (conversion: Omit<NonNullable<PosPayment['conversion']>, 'currency' | 'updatedAt'>) =>
    updatePosPayment(paymentId, { conversion: { ...conversion, currency, updatedAt: Date.now() } })

  // Payout goes to the account saved at the time of conversion
  const { circuit, bankData } = getPosSettings()
  if (!circuit || !bankData) return setConversion({ status: 'failed', error: 'No bank account is saved for payouts' })

  const amountSats = payment.receivedSats ?? payment.sats
  if (!amountSats) return setConversion({ status: 'failed', error: 'Nothing was received to convert' })

  let orderId = payment.conversion?.orderId
  setConversion({ status: 'converting', orderId })

  try {
    if (orderId) {
      if ((await reconcileOrder(orderId)) === 'paid-out') return setConversion({ status: 'submitted', orderId })
      orderId = undefined
    }

    // A previous withdrawal that was funded is only waiting for the provider to
    // confirm it, so a new sale can go ahead. One interrupted mid-payment may or
    // may not have sent funds — stop until it has been checked.
    const pending = await resolvePendingBankWithdrawal()
    if (pending.kind === 'awaiting' && pending.fundingState === 'funding') {
      throw new Error(
        'A previous withdrawal payment may still be processing. Check its order status before converting this payment.',
      )
    }

    const order = await fundBankWithdrawal({
      svcWallet: deps.svcWallet,
      signerPubkey: deps.signerPubkey,
      asset: 'BTC',
      currency,
      circuit,
      bankData,
      amountSats,
      email: getUserEmailForBankTransfer(),
      onOrderCreated: (created) => {
        orderId = created.id
        setConversion({ status: 'converting', orderId })
      },
    })
    return setConversion({ status: 'submitted', orderId: order.id })
  } catch (err) {
    consoleError(err, 'POS payout conversion failed')
    return setConversion({ status: 'failed', orderId, error: extractError(err) })
  }
}

/**
 * Off-ramp a received POS payment to the saved bank account. Safe to call
 * more than once: it is a no-op while queued/running or once submitted, and a
 * retry reconciles an order a previous attempt left behind instead of paying
 * again.
 */
export const convertPosPayment = (paymentId: string, deps: ConvertPosPaymentDeps): Promise<PosPayment | undefined> => {
  if (running.has(paymentId)) return Promise.resolve(getPosPayment(paymentId))
  running.add(paymentId)
  const job = queue.then(() => convertNow(paymentId, deps)).finally(() => running.delete(paymentId))
  queue = job.catch(() => undefined)
  return job
}

/**
 * Pick up conversions the app didn't get to finish: paid fiat sales whose
 * conversion never started, or was interrupted. Failed ones wait for a retry.
 */
export const resumePosConversions = (deps: ConvertPosPaymentDeps): Promise<unknown> =>
  Promise.all(
    getPosPayments()
      .filter(
        (p) =>
          p.status === 'completed' &&
          isFiatPayout(p.payoutCurrency) &&
          (!p.conversion || isConversionInterrupted(p)),
      )
      .map((p) => convertPosPayment(p.id, deps)),
  )
