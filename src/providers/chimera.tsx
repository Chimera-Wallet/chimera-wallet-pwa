import { isTestEnvironment } from '../lib/appConfig'

// Base URLs
const CHIMERA_API_STAGING = 'https://api.staging.chimerawallet.com/v1'
const CHIMERA_API_PRODUCTION = 'https://api.chimerawallet.com/v1'

const getBaseUrl = (): string => {
  return isTestEnvironment() ? CHIMERA_API_STAGING : CHIMERA_API_PRODUCTION
}

// Supported Asset
export interface SupportedAsset {
  symbol: string
  name: string
  hash?: string
  precision?: number
}

// Supported Assets Response
export interface SupportedAssetsResponse {
  from_assets: SupportedAsset[]
  to_assets: SupportedAsset[]
  supported_pairs?: Record<string, string[]>
}

// Request payload
export interface CreateOrderPayload {
  email: string
  from_amount: number
  from_asset: string
  to_asset: string
  destination_type: 'crypto'
  destination_crypto_address: string
  origin: 'mobile'
}

// Response
export interface ChimeraOrder {
  id: string
  email: string
  from_asset: string
  to_asset: string
  from_amount: string
  status:
    | 'WAITING_FOR_DEPOSIT'
    | 'DEPOSIT_RECEIVED'
    | 'DEPOSIT_CONFIRMED'
    | 'PROCESSING'
    | 'APPROVED'
    | 'COMPLETED'
    | 'EXPIRED'
    | 'CANCELLED'
    | 'REJECTED'
    | 'REFUNDED'
  created_at: string
  request_source: string
  funding_type: string
  origin: string
  expires_at?: string
  deposit_amount?: string | null
  destination_type: string
  destination_crypto_address?: string | null
  deposit_crypto_address?: string | null
  transfer_code?: string
  deposit_beneficiary?: string
  deposit_beneficiary_address?: string
  deposit_bank_name?: string
  deposit_bank_address?: string
  deposit_sepa_address?: string
  deposit_sepa_bic?: string
  deposit_sepa_beneficiary?: string
  deposit_sepa_beneficiary_address?: string
  deposit_sepa_bank_name?: string
  deposit_sepa_bank_address?: string
  deposit_swift_address?: string
  deposit_swift_bic?: string
  deposit_swift_intermediary_address?: string
  deposit_swift_beneficiary?: string
  deposit_swift_beneficiary_address?: string
  deposit_swift_bank_name?: string
  deposit_swift_bank_address?: string
  destination_bank_routing_number?: string
  destination_bank_account_number?: string
}

export const createOrder = async (payload: CreateOrderPayload): Promise<ChimeraOrder> => {
  const baseUrl = getBaseUrl()
  const response = await fetch(`${baseUrl}/order/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to create order: ${response.status} ${errorText}`)
  }

  return response.json()
}

export const getSupportedAssets = async (): Promise<SupportedAssetsResponse> => {
  const baseUrl = getBaseUrl()
  const response = await fetch(`${baseUrl}/assets/`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to get supported assets: ${response.status} ${errorText}`)
  }

  return response.json()
}

export const getOrderStatus = async (orderId: string): Promise<ChimeraOrder> => {
  const baseUrl = getBaseUrl()
  const response = await fetch(`${baseUrl}/order/${orderId}/`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to get order status: ${response.status} ${errorText}`)
  }

  return response.json()
}

// ============================================
// Bank Transfer (OTC) API Functions
// ============================================

import type { BankCircuit, BankData } from '../lib/bankTransferConfig'

// Bank Deposit Request (Fiat → Crypto)
export interface BankDepositPayload {
  email: string
  from_amount: number
  from_asset: string // Fiat currency (EUR, CHF, USD)
  to_asset: string // Crypto asset (BTC)
  destination_address: string // User's crypto receive address
}

// Bank Deposit Response includes bank details to send fiat to
export interface BankDepositResponse {
  order?: ChimeraOrder
  message?: string
  kycError?: boolean
}

// Bank Withdraw Request (Crypto → Fiat)
interface BankWithdrawBasePayload {
  email: string
  from_amount: number
  from_asset: string // Crypto asset (BTC)
  to_asset: string // Fiat currency (EUR, CHF, USD)
  destination_type: BankCircuit
}

type BankWithdrawSepaPayload = BankWithdrawBasePayload & {
  destination_type: 'sepa'
  destination_bank_address: string // IBAN
  destination_bank_name: string // Account holder name
}

type BankWithdrawSwiftPayload = BankWithdrawBasePayload & {
  destination_type: 'swift'
  destination_bank_address: string // IBAN
  destination_bank_name: string // Account holder name
  destination_bank_account_number: string
}

type BankWithdrawUsPayload = BankWithdrawBasePayload & {
  destination_type: 'us'
  destination_bank_account_number: string
  destination_bank_routing_number: string
}

type BankWithdrawPayload = BankWithdrawSepaPayload | BankWithdrawSwiftPayload | BankWithdrawUsPayload

export interface BankWithdrawResponse {
  order: ChimeraOrder
}

/**
 * Create a bank deposit order (Fiat → Crypto)
 * Returns bank details where user should send their fiat
 */
export const createBankDeposit = async (payload: BankDepositPayload): Promise<BankDepositResponse> => {
  const baseUrl = getBaseUrl()
  const response = await fetch(`${baseUrl}/otc/deposit/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    if (errorData.message) {
      throw new Error(errorData.message)
    }
    throw new Error(`Failed to create deposit order: ${response.status}`)
  }

  const data = await response.json()
  
  if (data.message) {
    throw new Error(data.message)
  }

  return data
}

/**
 * Create a bank withdraw order (Crypto → Fiat)
 * User provides their bank details where fiat will be sent
 */
export const createBankWithdraw = async (params: {
  email: string
  fromAmount: number
  fromAsset: string
  toAsset: string
  bankData: BankData
}): Promise<BankWithdrawResponse> => {
  const { email, fromAmount, fromAsset, toAsset, bankData } = params
  const baseUrl = getBaseUrl()

  let payload: BankWithdrawPayload

  switch (bankData.circuit) {
    case 'sepa':
      if (!bankData.destinationBankAddress || !bankData.accountHolderName) {
        throw new Error('SEPA transfer requires IBAN and account holder name')
      }
      payload = {
        email,
        from_amount: fromAmount,
        from_asset: fromAsset,
        to_asset: toAsset,
        destination_type: 'sepa',
        destination_bank_address: bankData.destinationBankAddress,
        destination_bank_name: bankData.accountHolderName,
      }
      break

    case 'swift':
      if (!bankData.destinationBankAddress || !bankData.accountHolderName || !bankData.accountNumber) {
        throw new Error('SWIFT transfer requires IBAN, account holder name, and account number')
      }
      payload = {
        email,
        from_amount: fromAmount,
        from_asset: fromAsset,
        to_asset: toAsset,
        destination_type: 'swift',
        destination_bank_address: bankData.destinationBankAddress,
        destination_bank_name: bankData.accountHolderName,
        destination_bank_account_number: bankData.accountNumber,
      }
      break

    case 'us':
      if (!bankData.accountNumber || !bankData.routingNumber) {
        throw new Error('US wire transfer requires account number and routing number')
      }
      payload = {
        email,
        from_amount: fromAmount,
        from_asset: fromAsset,
        to_asset: toAsset,
        destination_type: 'us',
        destination_bank_account_number: bankData.accountNumber,
        destination_bank_routing_number: bankData.routingNumber,
      }
      break

    default:
      throw new Error('Unsupported bank circuit')
  }

  const response = await fetch(`${baseUrl}/otc/withdraw/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    if (errorData.message) {
      throw new Error(errorData.message)
    }
    throw new Error(`Failed to create withdraw order: ${response.status}`)
  }

  return response.json()
}
