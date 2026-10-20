import { describe, expect, it } from 'vitest'
import { isWalletCache } from '../../lib/serviceWorkerCache'

describe('isWalletCache', () => {
  it('recognizes only Chimera wallet cache names', () => {
    expect(isWalletCache('chimera-wallet-cache-202609141053')).toBe(true)
    expect(isWalletCache('other-application-cache')).toBe(false)
    expect(isWalletCache('workbox-precache-v2')).toBe(false)
  })
})
