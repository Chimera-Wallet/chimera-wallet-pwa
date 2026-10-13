import { describe, it, expect } from 'vitest'
import { BUNDLED_CARDS, getSolverOrigin, isBundledPubkey } from '../../lib/swapMarkets'

const bundledPubkey = (BUNDLED_CARDS[0].card as { discovery_pubkey: string }).discovery_pubkey

describe('getSolverOrigin', () => {
  it('treats registry markets as registry', () => {
    expect(getSolverOrigin({ sourceType: 'registry', discovery_pubkey: 'aa' })).toBe('registry')
  })

  it('recognises bundled cards by discovery pubkey', () => {
    expect(isBundledPubkey(bundledPubkey.toUpperCase())).toBe(true)
    expect(getSolverOrigin({ sourceType: 'local', discovery_pubkey: bundledPubkey })).toBe('bundled')
  })

  it('labels any other local card as custom', () => {
    expect(getSolverOrigin({ sourceType: 'local', discovery_pubkey: 'ff'.repeat(32) })).toBe('custom')
    expect(getSolverOrigin({ sourceType: 'local', discovery_pubkey: undefined })).toBe('custom')
  })
})
