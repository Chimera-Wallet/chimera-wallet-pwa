/**
 * Bank transfer provider — selects between the legacy Chimera OTC API
 * (chimera.tsx) and the ramp-system API (ramp.ts) for fiat<->crypto bank
 * transfers (BankSend/BankReceive/BankOrderStatus), based on
 * VITE_BANK_TRANSFER_PROVIDER ('chimera' | 'ramp', default 'chimera').
 *
 * This is a strategy switch, not a URL — unlike the URLs in chimera.tsx /
 * ramp.ts (see CLAUDE.md "Configuration rule: no hardcoded or fallback API
 * URLs"), a default here is fine since it just picks which already-required
 * URL gets used.
 *
 * Both backends are normalized to the RampOrder-shaped `BankOrder` type
 * (re-exported from ramp.ts) so screens don't need to know which backend is
 * active. Gift cards have no Chimera equivalent and keep talking to
 * `./ramp` directly.
 */

import * as chimera from './chimera'
import type { ChimeraOrder } from './chimera'
import * as ramp from './ramp'
import type { RampOrder, RampBankDetails, RampOrderDirection, RampDestinationType } from './ramp'
import type { BankCircuit, BankCurrency, BankData } from '../lib/bankTransferConfig'

export type { RampOrder as BankOrder, RampBankDetails as BankDetails }

export type BankTransferProviderName = 'chimera' | 'ramp'

export const getBankTransferProvider = (): BankTransferProviderName =>
  import.meta.env.VITE_BANK_TRANSFER_PROVIDER === 'ramp' ? 'ramp' : 'chimera'

// ─── Chimera OTC order → BankOrder adapter ─────────────────────────────────

const stripArkSuffix = (asset: string): string => asset.replace(/-ARK$/, '')

// ─── Wallet ticker → ramp-system ticker ─────────────────────────────────────

// ramp-system splits each asset into two distinct tickers by settlement
// network: the plain ticker (BTC, USDT) settles to a native on-chain address
// (Bitcoin / Tron), while the Arkade variant (ARK-BTC, USDT-CX) settles to an
// ark1/tark1 address. This wallet only ever holds and pays out over Arkade, so
// it must always name the Arkade variant — sending the plain ticker alongside
// an Arkade address makes ramp reject the order with
// `destination_crypto_address is not a valid Bitcoin address`.
//
// The legacy Chimera path below encodes the same fact with its own convention
// (a `-ARK` suffix), which is why the two branches map the ticker differently.
const RAMP_ARKADE_TICKER: Record<string, string> = {
  BTC: 'ARK-BTC',
  USDT: 'USDT-CX',
}

const toRampTicker = (asset: string): string => {
  const upper = asset.toUpperCase()
  return RAMP_ARKADE_TICKER[upper] ?? upper
}

const CHIMERA_STATUS_MAP: Record<ChimeraOrder['status'], RampOrder['status']> = {
  WAITING_FOR_DEPOSIT: 'WAITING_FOR_DEPOSIT',
  DEPOSIT_RECEIVED: 'DEPOSIT_RECEIVED',
  DEPOSIT_CONFIRMED: 'PROCESSING',
  PROCESSING: 'PROCESSING',
  APPROVED: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'REJECTED',
  REJECTED: 'REJECTED',
  REFUNDED: 'REFUNDED',
}

const chimeraToBankOrder = (o: ChimeraOrder, direction: RampOrderDirection): RampOrder => {
  const isDeposit = direction === 'onramp'
  const swiftDetails = Boolean(o.deposit_swift_address)
  const sepaDetails = Boolean(o.deposit_sepa_address)

  return {
    id: o.id,
    code: o.id,
    email: o.email,
    direction,
    asset: stripArkSuffix(isDeposit ? o.to_asset : o.from_asset),
    fiat_currency: isDeposit ? o.from_asset : o.to_asset,
    // Deposit: fiat amount is known upfront. Withdrawal: crypto amount is
    // known upfront, fiat payout amount only after settlement.
    fiat_amount: isDeposit ? o.from_amount : (o.deposit_amount ?? null),
    crypto_amount: isDeposit ? (o.deposit_amount ?? null) : o.from_amount,
    status: CHIMERA_STATUS_MAP[o.status] ?? 'PENDING_MANUAL',
    transfer_code: o.transfer_code ?? '',
    destination_type: isDeposit ? 'crypto' : ((o.destination_type as RampDestinationType) ?? null),
    destination_crypto_address: o.destination_crypto_address ?? o.deposit_crypto_address ?? null,
    deposit_iban: (swiftDetails ? o.deposit_swift_address : o.deposit_sepa_address) ?? o.deposit_bank_address ?? null,
    deposit_bic: (swiftDetails ? o.deposit_swift_bic : null) ?? null,
    deposit_beneficiary:
      (swiftDetails ? o.deposit_swift_beneficiary : o.deposit_sepa_beneficiary) ?? o.deposit_beneficiary ?? null,
    deposit_bank_name:
      (swiftDetails ? o.deposit_swift_bank_name : o.deposit_sepa_bank_name) ?? o.deposit_bank_name ?? null,
    deposit_payment_type: swiftDetails ? 'swift' : sepaDetails ? 'sepa' : null,
    kyc_verified: false,
    created_at: o.created_at,
    expires_at: o.expires_at ?? null,
    completed_at: o.status === 'COMPLETED' ? o.created_at : null,
  }
}

// ─── Deposit (fiat -> crypto) ───────────────────────────────────────────────

export interface CreateDepositInput {
  asset: string // crypto ticker, e.g. BTC
  fiatCurrency: BankCurrency
  fiatAmount: number
  email: string
  destinationCryptoAddress: string
}

export interface CreateDepositResult {
  order: RampOrder
  bankDetails: RampBankDetails
}

export const createBankDeposit = async ({
  asset,
  fiatCurrency,
  fiatAmount,
  email,
  destinationCryptoAddress,
}: CreateDepositInput): Promise<CreateDepositResult> => {
  if (getBankTransferProvider() === 'ramp') {
    const { order, bank_details } = await ramp.createOnRampOrder({
      asset: toRampTicker(asset),
      fiat_currency: fiatCurrency,
      email,
      fiat_amount: String(fiatAmount),
      destination_crypto_address: destinationCryptoAddress,
      origin: 'app',
    })
    return { order, bankDetails: bank_details }
  }

  const subId = localStorage.getItem('subid')
  const response = await chimera.createBankDeposit({
    email,
    from_amount: fiatAmount,
    from_asset: fiatCurrency,
    to_asset: `${asset}-ARK`,
    destination_address: destinationCryptoAddress,
    ...(subId ? { sub_id: subId } : {}),
  })

  if (response.kycError) {
    throw new Error('KYC verification required')
  }
  if (!response.order) {
    throw new Error(response.message || 'Failed to create deposit order')
  }

  const order = chimeraToBankOrder(response.order, 'onramp')
  const bankDetails: RampBankDetails = {
    iban: order.deposit_iban ?? '',
    bic: order.deposit_bic ?? '',
    beneficiary: order.deposit_beneficiary ?? '',
    bank_name: order.deposit_bank_name ?? '',
    payment_type: order.deposit_payment_type ?? 'sepa',
    transfer_code: order.transfer_code,
  }
  return { order, bankDetails }
}

// ─── Withdrawal (crypto -> fiat) ────────────────────────────────────────────

export interface CreateWithdrawInput {
  asset: string // crypto ticker, e.g. BTC
  fiatCurrency: BankCurrency
  email: string
  cryptoAmountSats: number
  circuit: BankCircuit
  bankData?: BankData
}

export interface CreateWithdrawResult {
  order: RampOrder
}

const cryptoAmountToDecimalString = (sats: number, decimals = 8): string => (sats / 10 ** decimals).toString()

export const createBankWithdraw = async ({
  asset,
  fiatCurrency,
  email,
  cryptoAmountSats,
  circuit,
  bankData,
}: CreateWithdrawInput): Promise<CreateWithdrawResult> => {
  if (getBankTransferProvider() === 'ramp') {
    const cryptoAmount = cryptoAmountToDecimalString(cryptoAmountSats)
    const base = { asset: toRampTicker(asset), fiat_currency: fiatCurrency, email, crypto_amount: cryptoAmount, origin: 'app' as const }

    if (circuit === 'sepa') {
      const d = bankData?.circuit === 'sepa' ? bankData : undefined
      const { order } = await ramp.createOffRampOrder({
        ...base,
        destination_type: 'sepa',
        destination_bank_address: d?.destinationBankAddress,
        destination_bank_name: d?.accountHolderName,
      })
      return { order }
    }
    if (circuit === 'swift') {
      if (!bankData || bankData.circuit !== 'swift') throw new Error('Please complete the SWIFT bank details form')
      const { order } = await ramp.createOffRampOrder({
        ...base,
        destination_type: 'swift',
        destination_bank_address: bankData.destinationBankAddress,
        destination_bic: bankData.bic,
        destination_bank_name: bankData.accountHolderName,
        destination_country: bankData.country,
        destination_street_name: bankData.streetName,
        destination_building_number: bankData.buildingNumber,
        destination_town_name: bankData.townName,
        destination_post_code: bankData.postCode,
      })
      return { order }
    }
    if (!bankData || bankData.circuit !== 'us') throw new Error('Please complete the bank details form')
    const { order } = await ramp.createOffRampOrder({
      ...base,
      destination_type: 'us',
      destination_bank_account_number: bankData.accountNumber,
      destination_bank_routing_number: bankData.routingNumber,
      destination_bank_name: bankData.accountHolderName,
    })
    return { order }
  }

  const response = await chimera.createBankWithdraw({
    email,
    fromAmount: cryptoAmountSats,
    fromAsset: `${asset}-ARK`,
    toAsset: fiatCurrency,
    circuit,
    bankData,
  })
  return { order: chimeraToBankOrder(response.order, 'offramp') }
}

// ─── Order status ───────────────────────────────────────────────────────────

export const getBankOrderStatus = async (orderId: string, direction: RampOrderDirection): Promise<RampOrder> => {
  if (getBankTransferProvider() === 'ramp') {
    return ramp.getRampOrderStatus(orderId)
  }
  const order = await chimera.getOrderStatus(orderId)
  return chimeraToBankOrder(order, direction)
}
