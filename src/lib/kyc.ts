import { testDomains } from './constants'
import { getStorageItem } from './storage'

// KYC Storage Keys
const KYC_ACCESS_TOKEN_KEY = 'kyc_access_token'
const KYC_REFRESH_TOKEN_KEY = 'kyc_refresh_token'
const KYC_TOKEN_EXPIRY_KEY = 'kyc_token_expiry'
const KYC_USER_ID_KEY = 'kyc_user_id'
const KYC_EMAIL_KEY = 'kyc_email'
const KYC_STATUS_KEY = 'kyc_status'

// KYC Status Types
export type KycStatus = 'not_started' | 'pending' | 'confirmed' | 'rejected' | 'expired'

export interface KycTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface KycStatusResponse {
  status: KycStatus
  message?: string
}

export interface KycAuthParams {
  uid: string
  code: string
  type?: string
}

/**
 * Environment-aware IDFlow URLs
 */
const isTestEnvironment = (): boolean => {
  for (const domain of testDomains) {
    if (window.location.hostname.includes(domain)) {
      return true
    }
  }
  return false
}

export const getKycWebviewUrl = (): string => {
  if (import.meta.env.VITE_KYC_WEBVIEW_URL) {
    return import.meta.env.VITE_KYC_WEBVIEW_URL
  }
  return isTestEnvironment() ? 'https://demo-staging.idflow.ch/' : 'https://demo.idflow.ch/'
}

export const getKycApiUrl = (): string => {
  if (import.meta.env.VITE_KYC_API_URL) {
    return import.meta.env.VITE_KYC_API_URL
  }
  return isTestEnvironment() ? 'https://idflow-staging.azurewebsites.net' : 'https://api.idflow.ch'
}

/**
 * Build the webview URL with authentication parameters
 */
export const buildKycWebviewUrl = (params?: KycAuthParams): string => {
  const baseUrl = getKycWebviewUrl()
  if (!params) return baseUrl

  const searchParams = new URLSearchParams()
  searchParams.set('uid', params.uid)
  searchParams.set('code', params.code)
  if (params.type) {
    searchParams.set('type', params.type)
  }

  return `${baseUrl}?${searchParams.toString()}`
}

/**
 * Token Storage Functions
 */
export const saveKycTokens = (tokens: KycTokens, userId: string): void => {
  localStorage.setItem(KYC_ACCESS_TOKEN_KEY, tokens.accessToken)
  localStorage.setItem(KYC_REFRESH_TOKEN_KEY, tokens.refreshToken)
  localStorage.setItem(KYC_USER_ID_KEY, userId)
  // Store expiry time (current time + expiresIn seconds)
  const expiryTime = Date.now() + tokens.expiresIn * 1000
  localStorage.setItem(KYC_TOKEN_EXPIRY_KEY, expiryTime.toString())
}

export const getKycAccessToken = (): string | null => {
  return localStorage.getItem(KYC_ACCESS_TOKEN_KEY)
}

export const getKycRefreshToken = (): string | null => {
  return localStorage.getItem(KYC_REFRESH_TOKEN_KEY)
}

export const getKycUserId = (): string | null => {
  return localStorage.getItem(KYC_USER_ID_KEY)
}

export const saveKycEmail = (email: string): void => {
  localStorage.setItem(KYC_EMAIL_KEY, email)
}

export const getKycEmail = (): string | null => {
  return localStorage.getItem(KYC_EMAIL_KEY)
}

export const isKycTokenExpired = (): boolean => {
  const expiryStr = localStorage.getItem(KYC_TOKEN_EXPIRY_KEY)
  if (!expiryStr) return true
  const expiryTime = parseInt(expiryStr, 10)
  // Add 5 minute buffer
  return Date.now() > expiryTime - 5 * 60 * 1000
}

export const saveKycStatus = (status: KycStatus): void => {
  localStorage.setItem(KYC_STATUS_KEY, status)
}

export const getStoredKycStatus = (): KycStatus => {
  return getStorageItem(KYC_STATUS_KEY, 'not_started' as KycStatus, (val) => val as KycStatus)
}

export const clearKycData = (): void => {
  localStorage.removeItem(KYC_ACCESS_TOKEN_KEY)
  localStorage.removeItem(KYC_REFRESH_TOKEN_KEY)
  localStorage.removeItem(KYC_TOKEN_EXPIRY_KEY)
  localStorage.removeItem(KYC_USER_ID_KEY)
  localStorage.removeItem(KYC_EMAIL_KEY)
  localStorage.removeItem(KYC_STATUS_KEY)
}

export const hasCompletedKycOnce = (): boolean => {
  const userId = getKycUserId()
  const refreshToken = getKycRefreshToken()
  return Boolean(userId && refreshToken)
}

/**
 * API Functions
 */

/**
 * Confirm magic link and get access tokens
 */
export const confirmMagicLink = async (params: KycAuthParams): Promise<KycTokens> => {
  const apiUrl = getKycApiUrl()
  const response = await fetch(`${apiUrl}/api/auth/magic-link-confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userId: params.uid,
      code: params.code,
      type: params.type,
    }),
  })

  if (!response.ok) {
    throw new Error('Failed to confirm magic link')
  }

  const data = await response.json()

  // Token data is nested inside a 'token' object
  const tokenData = data.token
  if (!tokenData || !tokenData.accessToken) {
    throw new Error('Invalid token response')
  }

  // Extract and save email if provided (at same level as token)
  if (data.email) {
    saveKycEmail(data.email)
  }

  // Calculate expiresIn from expiryTime if provided
  let expiresIn = 3600 // Default to 1 hour
  if (tokenData.expiryTime) {
    const expiryDate = new Date(tokenData.expiryTime)
    expiresIn = Math.floor((expiryDate.getTime() - Date.now()) / 1000)
  }

  return {
    accessToken: tokenData.accessToken,
    refreshToken: tokenData.refreshToken,
    expiresIn,
  }
}

/**
 * Refresh access token using refresh token
 */
export const refreshKycToken = async (): Promise<KycTokens | null> => {
  const refreshToken = getKycRefreshToken()
  if (!refreshToken) return null

  const apiUrl = getKycApiUrl()
  try {
    const response = await fetch(`${apiUrl}/api/auth/refresh-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refreshToken,
      }),
    })

    if (!response.ok) {
      // Refresh token expired or invalid
      clearKycData()
      return null
    }

    const data = await response.json()
    const tokens: KycTokens = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || refreshToken,
      expiresIn: data.expiresIn || 3600,
    }

    const userId = getKycUserId()
    if (userId) {
      saveKycTokens(tokens, userId)
    }

    return tokens
  } catch {
    return null
  }
}

/**
 * Get valid access token (refresh if expired)
 */
export const getValidAccessToken = async (): Promise<string | null> => {
  const accessToken = getKycAccessToken()

  if (!accessToken) {
    return null
  }

  if (!isKycTokenExpired()) {
    return accessToken
  }

  // Try to refresh
  const newTokens = await refreshKycToken()
  return newTokens?.accessToken || null
}

/**
 * Fetch KYC status from API
 * @param providedAccessToken - Optional access token to use directly (bypasses storage lookup)
 */
export const fetchKycStatus = async (providedAccessToken?: string): Promise<KycStatusResponse> => {
  const accessToken = providedAccessToken || (await getValidAccessToken())

  if (!accessToken) {
    return { status: 'not_started', message: 'No valid authentication' }
  }

  const apiUrl = getKycApiUrl()
  try {
    const response = await fetch(`${apiUrl}/api/Registration/status`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      if (response.status === 401) {
        // Token invalid, clear and restart
        clearKycData()
        return { status: 'not_started', message: 'Session expired' }
      }
      throw new Error('Failed to fetch KYC status')
    }

    const data = await response.json()

    // Map API response to our status type
    const status = mapVerificationStatus(data.status)

    saveKycStatus(status)
    return { status, message: data.message }
  } catch (error) {
    const storedStatus = getStoredKycStatus()
    return { status: storedStatus, message: 'Unable to fetch current status' }
  }
}

/**
 * Parse KYC deep link parameters
 * Format: chimera://uni/kyc/<uid>/<code>/<type>
 * or URL: #kyc?uid=<uid>&code=<code>&type=<type>
 */
export const parseKycDeepLink = (hashOrQuery: string): KycAuthParams | null => {
  // Remove leading # if present
  const cleanInput = hashOrQuery.startsWith('#') ? hashOrQuery.slice(1) : hashOrQuery

  // Check if it starts with kyc?
  if (cleanInput.startsWith('kyc?')) {
    const queryString = cleanInput.slice(4) // Remove 'kyc?'
    const searchParams = new URLSearchParams(queryString)
    const uid = searchParams.get('uid')
    const code = searchParams.get('code')
    const type = searchParams.get('type')

    if (uid && code) {
      return { uid, code, type: type || undefined }
    }
  }

  // Try legacy app+ format
  const searchParams = new URLSearchParams(cleanInput)
  const uid = searchParams.get('uid')
  const code = searchParams.get('code')
  const type = searchParams.get('type')

  if (uid && code) {
    return { uid, code, type: type || undefined }
  }

  // Try path format: <uid>/<code>/<type>
  const parts = cleanInput.split('/')
  if (parts.length >= 2) {
    return {
      uid: parts[0],
      code: parts[1],
      type: parts[2] || undefined,
    }
  }

  return null
}

// ─── Magic Link / Session Polling ────────────────────────────────────────────

export interface CheckSessionLoginModel {
  userId: string
  entityId: string
  email: string
  username: string
  hasVerifiedEmail: boolean
  tfaEnabled: boolean
  phoneConfirmed: boolean
  token: {
    accessToken: string
    expiryTime: string
    refreshToken: string
  }
  verificationStatus: {
    status: string
    notes: string
    veriffStatus: string
    documentsSubmitted: string[]
  }
}

export interface CheckSessionResponse {
  isVerified: boolean
  loginModel?: CheckSessionLoginModel
}

/**
 * Send a magic link email to start the KYC authentication flow
 */
export const requestMagicLink = async (email: string, sessionId: string): Promise<void> => {
  const apiUrl = getKycApiUrl()
  const response = await fetch(`${apiUrl}/api/auth/magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, sessionId }),
  })
  if (!response.ok) {
    throw new Error('Failed to send magic link')
  }
}

/**
 * Poll to check whether the user has clicked the magic link
 */
export const checkSessionVerified = async (
  email: string,
  sessionId: string,
): Promise<CheckSessionResponse> => {
  const apiUrl = getKycApiUrl()
  const response = await fetch(`${apiUrl}/api/auth/check-session-verified`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, sessionId }),
  })
  if (!response.ok) {
    throw new Error('Failed to check session')
  }
  return response.json()
}

/**
 * Map IDFlow's verification status string to our KycStatus type
 */
export const mapVerificationStatus = (status?: string): KycStatus => {
  if (!status) return 'not_started'
  switch (status.toLowerCase()) {
    case 'verified':
    case 'confirmed':
    case 'approved':
      return 'confirmed'
    case 'pending':
    case 'moreinfoneeded':
    case 'incomplete':
      return 'pending'
    case 'rejected':
      return 'rejected'
    case 'expired':
      return 'expired'
    default:
      return 'not_started'
  }
}

/**
 * Persist tokens and status from a verified session's loginModel
 */
export const saveKycTokensFromLoginModel = (loginModel: CheckSessionLoginModel): void => {
  const { token, userId } = loginModel
  let expiresIn = 3600
  if (token.expiryTime) {
    const expiryDate = new Date(token.expiryTime)
    expiresIn = Math.max(0, Math.floor((expiryDate.getTime() - Date.now()) / 1000))
  }
  saveKycTokens(
    { accessToken: token.accessToken, refreshToken: token.refreshToken, expiresIn },
    userId,
  )
  if (loginModel.email) saveKycEmail(loginModel.email)
  if (loginModel.verificationStatus?.status) {
    saveKycStatus(mapVerificationStatus(loginModel.verificationStatus.status))
  }
}

// ─── Bank transfer helpers ────────────────────────────────────────────────────

interface IdFlowWallet {
  type: string
  address: string
}

interface IdFlowUserProfile {
  firstName?: string
  lastName?: string
  email?: string
}

export interface KycBankData {
  iban?: string
  accountHolderName?: string
  accountNumber?: string  // US/SWIFT
  routingNumber?: string  // US
}

/**
 * Fetch the user's IDFlow wallets (IBAN, USAN, USRN etc.)
 */
const fetchKycWallets = async (accessToken: string): Promise<IdFlowWallet[]> => {
  const apiUrl = getKycApiUrl()
  const response = await fetch(`${apiUrl}/api/Entity/me/wallets`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  })
  if (!response.ok) throw new Error('Failed to fetch KYC wallets')
  return response.json()
}

/**
 * Fetch the user's IDFlow profile (name etc.)
 */
const fetchKycUserProfile = async (accessToken: string): Promise<IdFlowUserProfile> => {
  const apiUrl = getKycApiUrl()
  const response = await fetch(`${apiUrl}/api/Entity/me`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  })
  if (!response.ok) throw new Error('Failed to fetch KYC user profile')
  return response.json()
}

/**
 * Fetch and assemble bank data from IDFlow for use in withdraw requests.
 * Returns null if no valid token or data is unavailable.
 */
export const fetchKycBankData = async (): Promise<KycBankData | null> => {
  try {
    const accessToken = await getValidAccessToken()
    if (!accessToken) return null

    const [wallets, profile] = await Promise.all([
      fetchKycWallets(accessToken),
      fetchKycUserProfile(accessToken),
    ])

    const iban = wallets.find((w) => w.type === 'IBAN')?.address
    const accountNumber = wallets.find((w) => w.type === 'USAN')?.address
    const routingNumber = wallets.find((w) => w.type === 'USRN')?.address

    const nameParts = [profile.firstName, profile.lastName].filter(Boolean)
    const accountHolderName = nameParts.length > 0 ? nameParts.join(' ') : undefined

    return { iban, accountHolderName, accountNumber, routingNumber }
  } catch {
    return null
  }
}

/**
 * Get user email for bank transfers
 * Returns KYC email if available, otherwise generates a dummy email
 */
export const getUserEmailForBankTransfer = (): string => {
  // First try to get KYC email
  const kycEmail = getKycEmail()
  if (kycEmail) {
    return kycEmail
  }

  // Generate dummy email using crypto.randomUUID()
  const uuid1 = crypto.randomUUID()
  const uuid2 = crypto.randomUUID()
  return `${uuid1}@${uuid2}.com`
}
