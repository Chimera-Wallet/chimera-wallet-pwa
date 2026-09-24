import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearKycData, fetchAuthoritativeKycStatus, saveKycStatus, saveKycTokens } from '../../lib/kyc'

describe('authoritative KYC status', () => {
  afterEach(() => {
    clearKycData()
    vi.unstubAllGlobals()
  })

  it('does not treat stored KYC state as authorization without a valid token', async () => {
    saveKycStatus('confirmed')

    await expect(fetchAuthoritativeKycStatus()).resolves.toBeNull()
  })

  it('uses the server status instead of stored KYC state', async () => {
    saveKycTokens({ accessToken: 'access', refreshToken: 'refresh', expiresIn: 3_600 }, 'user')
    saveKycStatus('confirmed')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'incomplete' }), { status: 200 })))

    await expect(fetchAuthoritativeKycStatus()).resolves.toBe('incomplete')
  })
})
