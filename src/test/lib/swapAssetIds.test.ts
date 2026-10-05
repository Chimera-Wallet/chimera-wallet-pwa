import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAssetSymbolBySwapAssetId, getSwapAssetId, getWrappedAssetId, hasSwapOnlyAssetId } from '../../lib/assets'

// vitest.config.ts sets VITE_ARKADE_USDT=test-usdt, VITE_ARKADE_SWAP_USDT=test-usdt-swap.
describe('swap asset ids', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('uses the swap override for USDT without changing its wrapped id', () => {
    expect(getSwapAssetId('USDT')).toBe('test-usdt-swap')
    expect(getSwapAssetId('usdt')).toBe('test-usdt-swap')
    expect(getWrappedAssetId('USDT')).toBe('test-usdt')
  })

  it('falls back to the wrapped id for assets without an override', () => {
    expect(getSwapAssetId('ETH')).toBe('test-eth')
  })

  it('resolves both the swap id and the wrapped id back to the symbol', () => {
    expect(getAssetSymbolBySwapAssetId('test-usdt-swap')).toBe('USDT')
    expect(getAssetSymbolBySwapAssetId('test-usdt')).toBe('USDT')
    expect(getAssetSymbolBySwapAssetId('test-eth')).toBe('ETH')
    expect(getAssetSymbolBySwapAssetId('unknown')).toBeUndefined()
  })

  it('flags only symbols whose swap id differs from the wrapped id', () => {
    expect(hasSwapOnlyAssetId('USDT')).toBe(true)
    expect(hasSwapOnlyAssetId('ETH')).toBe(false)
    expect(hasSwapOnlyAssetId('BTC')).toBe(false)
  })

  it('falls back to VITE_ARKADE_USDT when the swap override is empty', async () => {
    vi.stubEnv('VITE_ARKADE_SWAP_USDT', '')
    vi.resetModules()
    const assets = await import('../../lib/assets')
    expect(assets.getSwapAssetId('USDT')).toBe('test-usdt')
    expect(assets.hasSwapOnlyAssetId('USDT')).toBe(false)
  })
})
