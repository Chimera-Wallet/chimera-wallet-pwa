import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBankTransferProvider } from '../../providers/bankTransfer'
import { getRampLimits } from '../../providers/ramp'
import {
  getBankTransferConfig,
  getKycThresholdLabel,
  getMinimumOrderValue,
  requiresKyc,
  SWIFT_MINIMUM_ORDER_VALUE,
} from '../../lib/bankTransferConfig'

vi.mock('../../providers/bankTransfer', () => ({ getBankTransferProvider: vi.fn(() => 'ramp') }))
vi.mock('../../providers/ramp', () => ({ getRampLimits: vi.fn() }))

const rampLimits = {
  min_order_chf: '20',
  kyc_threshold_chf: '1000',
  by_currency: {
    CHF: { min_order: '20.00', kyc_threshold: '1000.00' },
    EUR: { min_order: '21.06', kyc_threshold: '1052.63' },
    USD: { min_order: '22.73', kyc_threshold: '1136.36' },
  },
}

describe('bank transfer limits', () => {
  afterEach(() => {
    vi.mocked(getBankTransferProvider).mockReturnValue('ramp')
  })

  it("uses ramp's limits for each currency once loaded", async () => {
    vi.mocked(getRampLimits).mockResolvedValueOnce(rampLimits)
    await getBankTransferConfig(true)

    expect(getMinimumOrderValue('sepa', 'EUR')).toBe(21.06)
    expect(getMinimumOrderValue('swift', 'CHF')).toBe(SWIFT_MINIMUM_ORDER_VALUE)
    expect(requiresKyc(1052.62, 'EUR')).toBe(false)
    // ramp asks for KYC from the threshold itself
    expect(requiresKyc(1052.63, 'EUR')).toBe(true)
    expect(getKycThresholdLabel()).toBe(`${(1000).toLocaleString()} CHF`)
  })

  it('keeps the last known limits when ramp is unreachable', async () => {
    vi.mocked(getRampLimits).mockResolvedValueOnce(rampLimits)
    await getBankTransferConfig(true)
    vi.mocked(getRampLimits).mockRejectedValueOnce(new Error('offline'))
    await getBankTransferConfig(true)

    expect(getMinimumOrderValue('sepa', 'EUR')).toBe(21.06)
  })

  it('keeps the legacy limits on the Chimera provider, without asking ramp', async () => {
    vi.mocked(getBankTransferProvider).mockReturnValue('chimera')
    vi.mocked(getRampLimits).mockClear()
    await getBankTransferConfig(true)

    expect(getMinimumOrderValue('sepa', 'EUR')).toBe(15)
    expect(getRampLimits).not.toHaveBeenCalled()
  })
})
