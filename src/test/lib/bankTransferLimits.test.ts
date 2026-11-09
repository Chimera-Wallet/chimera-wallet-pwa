import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBankTransferLimits } from '../../providers/bankTransfer'
import {
  getBankTransferConfig,
  getKycThresholdLabel,
  getMinimumOrderValue,
  limitsFor,
  requiresKyc,
  SWIFT_MINIMUM_ORDER_VALUE,
} from '../../lib/bankTransferConfig'

// The provider switch lives in providers/bankTransfer: on Chimera it returns no
// limits, on ramp it returns ramp's.
vi.mock('../../providers/bankTransfer', () => ({ getBankTransferLimits: vi.fn() }))

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
    vi.mocked(getBankTransferLimits).mockReset()
  })

  it("uses ramp's limits for each currency once loaded", async () => {
    vi.mocked(getBankTransferLimits).mockResolvedValueOnce(rampLimits)
    const config = await getBankTransferConfig(true)

    expect(getMinimumOrderValue(config, 'sepa', 'EUR')).toBe(21.06)
    expect(getMinimumOrderValue(config, 'swift', 'CHF')).toBe(SWIFT_MINIMUM_ORDER_VALUE)
    // ramp publishes the threshold rounded down, so anything below it never
    // needs KYC; from the threshold up it's treated as needing it
    expect(requiresKyc(config, 1052.62, 'EUR')).toBe(false)
    expect(requiresKyc(config, 1052.63, 'EUR')).toBe(true)
    expect(getKycThresholdLabel(config)).toBe(`${(1000).toLocaleString()} CHF`)
  })

  it('keeps the last known limits when ramp is unreachable', async () => {
    vi.mocked(getBankTransferLimits).mockResolvedValueOnce(rampLimits)
    await getBankTransferConfig(true)
    vi.mocked(getBankTransferLimits).mockRejectedValueOnce(new Error('offline'))
    const config = await getBankTransferConfig(true)

    expect(getMinimumOrderValue(config, 'sepa', 'EUR')).toBe(21.06)
  })

  it('keeps the legacy limits when the provider publishes none', async () => {
    vi.mocked(getBankTransferLimits).mockResolvedValueOnce(undefined)
    const config = await getBankTransferConfig(true)

    expect(getMinimumOrderValue(config, 'sepa', 'EUR')).toBe(15)
    expect(requiresKyc(config, 999, 'EUR')).toBe(false)
  })

  it('drops currencies with unusable values, which then fall back to the defaults', async () => {
    vi.mocked(getBankTransferLimits).mockResolvedValueOnce({
      ...rampLimits,
      by_currency: {
        CHF: { min_order: '20.00', kyc_threshold: '1000.00' },
        EUR: { min_order: 'abc', kyc_threshold: '1052.63' },
        USD: { min_order: '0', kyc_threshold: '1136.36' },
        GBP: { min_order: '18.00', kyc_threshold: '-1' },
      } as never,
    })
    const config = await getBankTransferConfig(true)

    expect(Object.keys(config.limits)).toEqual(['CHF'])
    expect(limitsFor(config, 'EUR')).toEqual({ minimumOrderValue: 15, kycThreshold: 1000 })
    expect(limitsFor(config, 'USD')).toEqual({ minimumOrderValue: 15, kycThreshold: 1000 })
  })

  it('ignores keys that are not currencies of its own, like __proto__', async () => {
    // As it arrives off the wire: JSON.parse makes __proto__ an own key
    const one = '{"min_order": "1", "kyc_threshold": "1"}'
    const byCurrency = JSON.parse(
      `{"__proto__": ${one}, "toString": ${one}, "XYZ": ${one}, "CHF": {"min_order": "20", "kyc_threshold": "1000"}}`,
    )
    vi.mocked(getBankTransferLimits).mockResolvedValueOnce({ ...rampLimits, by_currency: byCurrency })
    const config = await getBankTransferConfig(true)

    expect(Object.keys(config.limits)).toEqual(['CHF'])
    expect(Object.getPrototypeOf(config.limits)).toBe(Object.prototype)
  })

  it('falls back to the defaults when the response has no per-currency limits', async () => {
    vi.mocked(getBankTransferLimits).mockResolvedValueOnce({ ...rampLimits, by_currency: null as never })
    const config = await getBankTransferConfig(true)

    expect(config.limits).toEqual({})
    expect(getMinimumOrderValue(config, 'sepa', 'CHF')).toBe(15)
  })
})
