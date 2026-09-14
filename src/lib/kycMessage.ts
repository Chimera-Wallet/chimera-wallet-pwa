import type { KycStatus } from './kyc'

const KYC_STATUSES: KycStatus[] = ['not_started', 'pending', 'confirmed', 'rejected', 'incomplete', 'more_info_needed']

export type KycMessage =
  | { type: 'kyc-ready' | 'kyc-loaded' | 'kyc-fonts-failed' | 'kyc-text-not-rendering' | 'kyc-complete' }
  | { type: 'kyc-tokens'; accessToken: string; refreshToken: string; expiresIn?: number; userId: string }
  | { type: 'kyc-status'; status: KycStatus }

const hasOnlyKeys = (data: Record<string, unknown>, keys: string[]): boolean => Object.keys(data).every((key) => keys.includes(key))

export const getKycOrigin = (url: string): string | null => {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

export const isKycMessage = (data: unknown): data is KycMessage => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  const message = data as Record<string, unknown>

  switch (message.type) {
    case 'kyc-ready':
    case 'kyc-loaded':
    case 'kyc-fonts-failed':
    case 'kyc-text-not-rendering':
    case 'kyc-complete':
      return hasOnlyKeys(message, ['type'])
    case 'kyc-tokens':
      return (
        hasOnlyKeys(message, ['type', 'accessToken', 'refreshToken', 'expiresIn', 'userId']) &&
        typeof message.accessToken === 'string' &&
        typeof message.refreshToken === 'string' &&
        typeof message.userId === 'string' &&
        (message.expiresIn === undefined || (typeof message.expiresIn === 'number' && Number.isSafeInteger(message.expiresIn) && message.expiresIn > 0))
      )
    case 'kyc-status':
      return hasOnlyKeys(message, ['type', 'status']) && typeof message.status === 'string' && KYC_STATUSES.includes(message.status as KycStatus)
    default:
      return false
  }
}
