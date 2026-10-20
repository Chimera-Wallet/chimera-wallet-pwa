import { describe, expect, it } from 'vitest'
import { getKycOrigin, isKycMessage } from '../../lib/kycMessage'

describe('KYC messages', () => {
  it('uses the exact configured origin', () => {
    expect(getKycOrigin('https://demo.idflow.ch/verification?email=user@example.com')).toBe('https://demo.idflow.ch')
    expect(getKycOrigin('https://idflow.ch.attacker.example')).not.toBe('https://idflow.ch')
  })

  it('accepts only valid, expected KYC payloads', () => {
    expect(isKycMessage({ type: 'kyc-status', status: 'confirmed' })).toBe(true)
    expect(isKycMessage({ type: 'kyc-tokens', accessToken: 'access', refreshToken: 'refresh', userId: 'user', expiresIn: 3600 })).toBe(true)
    expect(isKycMessage({ type: 'kyc-status', status: 'attacker-controlled' })).toBe(false)
    expect(isKycMessage({ type: 'kyc-complete', accessToken: 'unexpected' })).toBe(false)
  })
})
