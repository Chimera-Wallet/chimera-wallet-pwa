import { isTestEnvironment } from '../lib/appConfig'
import { getKycApiUrl } from '../lib/kyc'

// Base URLs
const CHIMERA_API_STAGING = 'https://api.staging.chimerawallet.com/v1'
const CHIMERA_API_PRODUCTION = 'https://api.chimerawallet.com/v1'

const getBaseUrl = (): string => {
  // Check for environment variable override first
  if (import.meta.env.VITE_CHIMERA_API) {
    return import.meta.env.VITE_CHIMERA_API
  }
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

/**
 * Get order status by ID
 *
 * Orders created via /otc/deposit/ or /otc/withdraw/ are regular Chimera orders
 * and can be queried using the /order/info/<id>/ endpoint.
 */
export const getOrderStatus = async (orderId: string): Promise<ChimeraOrder> => {
  if (!orderId) {
    throw new Error('No order ID provided')
  }

  const baseUrl = getBaseUrl()
  const url = `${baseUrl}/order/info/${orderId}/`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to get order status: ${response.status} ${errorText}`)
  }

  const data = await response.json()

  // The endpoint returns { order: ChimeraOrder }, extract the order
  if (data.order) {
    return data.order
  }

  return data
}

// ============================================
// Referral API Functions
// ============================================

export interface ReferralLinkResponse {
  link: string
}

export interface ReferralRewardResponse {
  balance: number // CHF
}

export const getReferralLink = async (accessToken: string): Promise<ReferralLinkResponse> => {
  const baseUrl = getKycApiUrl()
  const response = await fetch(`${baseUrl}/api/Referrals/link`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to get referral link: ${response.status}`)
  }
  const data = await response.json()
  // Handle various C# API response shapes
  const link: string = typeof data === 'string' ? data : (data.referralLink ?? '')
  return { link }
}

export const getReferralReward = async (accessToken: string): Promise<ReferralRewardResponse> => {
  const baseUrl = getKycApiUrl()
  const response = await fetch(`${baseUrl}/api/Referrals/reward-balance`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to get referral reward: ${response.status}`)
  }
  const data = await response.json()
  // Handle various C# API response shapes
  const balance: number = typeof data === 'number' ? data : (data.rewardBalance ?? 0)
  return { balance }
}

export const claimReferralReward = async (accessToken: string, address: string): Promise<void> => {
  const baseUrl = getKycApiUrl()
  const response = await fetch(`${baseUrl}/api/Referrals/reward-address`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ address }),
  })
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.message || `Failed to claim referral reward: ${response.status}`)
  }
}
