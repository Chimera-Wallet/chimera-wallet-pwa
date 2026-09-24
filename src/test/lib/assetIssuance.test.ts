import { describe, expect, it, vi } from 'vitest'
import { waitForIssuedAsset } from '../../lib/assetIssuance'

describe('waitForIssuedAsset', () => {
  it('waits for the exact issued asset to appear in the wallet balance', async () => {
    const getBalance = vi
      .fn()
      .mockResolvedValueOnce({ assets: [{ assetId: 'other-asset', amount: BigInt(1) }] })
      .mockResolvedValueOnce({ assets: [{ assetId: 'issued-asset', amount: BigInt(1) }] })

    await expect(waitForIssuedAsset({ getBalance }, 'issued-asset', 100, 1)).resolves.toBeUndefined()
    expect(getBalance).toHaveBeenCalledTimes(2)
  })

  it('fails instead of waiting indefinitely when the asset never appears', async () => {
    await expect(waitForIssuedAsset({ getBalance: vi.fn().mockResolvedValue({ assets: [] }) }, 'issued-asset', 0, 1)).rejects.toThrow(
      'Timed out waiting for the issued control asset',
    )
  })
})
