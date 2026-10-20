import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOffRampOrder, createOnRampOrder } from '../../providers/ramp'

// ramp-system names the Arkade variant of each asset with its own ticker; the
// plain one settles on-chain and would make ramp reject this wallet's ark1/tark1
// addresses. Pinned here, at the boundary where the wallet's symbols go out.
describe('ramp ticker mapping', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubEnv('VITE_RAMP_API', 'https://ramp.test')
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  const respondWith = (asset: string) =>
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ order: { id: 'order-1', asset }, deposit_crypto_address: null, fee: {} }), {
        status: 200,
      }),
    )

  const sentAsset = () => JSON.parse(fetchMock.mock.calls[0][1].body).asset

  it.each([
    ['BTC', 'ARK-BTC'],
    ['btc', 'ARK-BTC'],
    ['USDT', 'USDT-CX'],
    ['usdt', 'USDT-CX'],
  ])('sends %s as %s and reads it back as the plain symbol', async (asset, wire) => {
    respondWith(wire)

    const { order } = await createOffRampOrder({
      asset,
      fiat_currency: 'EUR',
      email: 'user@example.com',
      crypto_amount: '0.001',
      destination_type: 'sepa',
    })

    expect(sentAsset()).toBe(wire)
    expect(order.asset).toBe(asset.toUpperCase())
  })

  it('maps on-ramp orders the same way', async () => {
    respondWith('USDT-CX')

    await createOnRampOrder({
      asset: 'USDT',
      fiat_currency: 'EUR',
      email: 'user@example.com',
      fiat_amount: '100',
      destination_crypto_address: 'ark1x',
    })

    expect(sentAsset()).toBe('USDT-CX')
  })

  it('passes an Arkade ticker through unchanged', async () => {
    respondWith('ARK-BTC')

    await createOffRampOrder({
      asset: 'ARK-BTC',
      fiat_currency: 'EUR',
      email: 'user@example.com',
      crypto_amount: '0.001',
      destination_type: 'sepa',
    })

    expect(sentAsset()).toBe('ARK-BTC')
  })
})
