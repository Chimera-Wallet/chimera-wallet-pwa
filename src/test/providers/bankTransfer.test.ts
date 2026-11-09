import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBankWithdraw, getBankTransferLimits, reportBankWithdrawalFunding } from '../../providers/bankTransfer'
import * as ramp from '../../providers/ramp'
import fixtures from '../fixtures.json'

vi.mock('../../providers/ramp', () => ({
  createOffRampOrder: vi.fn(),
  reportRampDeposit: vi.fn(),
  getRampLimits: vi.fn(),
}))

describe('createBankWithdraw', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('returns the Ramp deposit address to fund', async () => {
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
    // ramp.ts maps the plain asset to its Arkade ticker at its own boundary
    expect(ramp.createOffRampOrder).toHaveBeenCalledWith(
      expect.objectContaining({ asset: 'BTC', crypto_amount: '0.00100000' }),
    )
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

describe('reportBankWithdrawalFunding', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('reports the txid to ramp and returns the updated order', async () => {
    vi.stubEnv('VITE_BANK_TRANSFER_PROVIDER', 'ramp')
    vi.mocked(ramp.reportRampDeposit).mockResolvedValue({ id: 'order-1', status: 'DEPOSIT_RECEIVED' } as never)

    await expect(reportBankWithdrawalFunding('order-1', 'txid')).resolves.toMatchObject({ status: 'DEPOSIT_RECEIVED' })
    expect(ramp.reportRampDeposit).toHaveBeenCalledWith('order-1', 'txid')
  })

  it('is a no-op on the legacy Chimera provider', async () => {
    vi.stubEnv('VITE_BANK_TRANSFER_PROVIDER', 'chimera')

    await expect(reportBankWithdrawalFunding('order-1', 'txid')).resolves.toBeUndefined()
    expect(ramp.reportRampDeposit).not.toHaveBeenCalled()
  })
})

describe('getBankTransferLimits', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it("returns ramp's limits on ramp", async () => {
    vi.stubEnv('VITE_BANK_TRANSFER_PROVIDER', 'ramp')
    const limits = { min_order_chf: '20', kyc_threshold_chf: '1000', by_currency: {} }
    vi.mocked(ramp.getRampLimits).mockResolvedValue(limits)

    await expect(getBankTransferLimits()).resolves.toBe(limits)
  })

  it('returns none on the legacy Chimera provider, without asking ramp', async () => {
    vi.stubEnv('VITE_BANK_TRANSFER_PROVIDER', 'chimera')

    await expect(getBankTransferLimits()).resolves.toBeUndefined()
    expect(ramp.getRampLimits).not.toHaveBeenCalled()
  })
})
