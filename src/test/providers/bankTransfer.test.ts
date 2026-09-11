import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBankWithdraw } from '../../providers/bankTransfer'
import * as ramp from '../../providers/ramp'
import fixtures from '../fixtures.json'

vi.mock('../../providers/ramp', () => ({
  createOffRampOrder: vi.fn(),
}))

describe('createBankWithdraw', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('returns the order-specific Ramp deposit address', async () => {
    vi.stubEnv('VITE_BANK_TRANSFER_PROVIDER', 'ramp')
    const depositCryptoAddress = fixtures.lib.address.ark[0].address
    vi.mocked(ramp.createOffRampOrder).mockResolvedValue({
      order: { id: 'order-1' },
      deposit_crypto_address: depositCryptoAddress,
      fee: {} as never,
    } as never)

    const result = await createBankWithdraw({
      asset: 'BTC',
      fiatCurrency: 'EUR',
      email: 'user@example.com',
      cryptoAmountSats: 100_000,
      circuit: 'sepa',
    })

    expect(result.depositCryptoAddress).toBe(depositCryptoAddress)
  })

  it('rejects a Ramp order without a valid Ark deposit address', async () => {
    vi.stubEnv('VITE_BANK_TRANSFER_PROVIDER', 'ramp')
    vi.mocked(ramp.createOffRampOrder).mockResolvedValue({
      order: { id: 'order-1' },
      deposit_crypto_address: null,
      fee: {} as never,
    } as never)

    await expect(
      createBankWithdraw({
        asset: 'BTC',
        fiatCurrency: 'EUR',
        email: 'user@example.com',
        cryptoAmountSats: 100_000,
        circuit: 'sepa',
      }),
    ).rejects.toThrow('Ramp returned an invalid withdrawal deposit address')
  })
})
