import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IWallet } from '@arkade-os/sdk'

vi.mock('../../lib/utxo', () => ({ getConfirmedAndNotExpiredUtxos: vi.fn() }))

import { getConfirmedAndNotExpiredUtxos } from '../../lib/utxo'
import { settleBoardingUtxos } from '../../lib/asp'

// Auto-boarding is a Chimera requirement (see WalletContext.boardDeposits):
// confirmed deposits must reach the wallet without the user pressing anything.

const dust = BigInt(333)
const arkAddress = 'tark1qexample'

const makeWallet = () =>
  ({
    getAddress: vi.fn().mockResolvedValue(arkAddress),
    settle: vi.fn().mockResolvedValue('txid'),
  }) as unknown as IWallet & { settle: ReturnType<typeof vi.fn> }

describe('settleBoardingUtxos', () => {
  beforeEach(() => vi.mocked(getConfirmedAndNotExpiredUtxos).mockReset())

  it('boards every confirmed deposit into the wallet in one settlement', async () => {
    const utxos = [{ value: 20_000 }, { value: 5_000 }]
    vi.mocked(getConfirmedAndNotExpiredUtxos).mockResolvedValue(utxos as never)
    const wallet = makeWallet()

    await expect(settleBoardingUtxos(wallet, dust)).resolves.toBe(true)
    expect(wallet.settle).toHaveBeenCalledWith(
      { inputs: utxos, outputs: [{ address: arkAddress, amount: BigInt(25_000) }] },
      expect.any(Function),
    )
  })

  it('does nothing when there is no confirmed deposit', async () => {
    vi.mocked(getConfirmedAndNotExpiredUtxos).mockResolvedValue([])
    const wallet = makeWallet()

    await expect(settleBoardingUtxos(wallet, dust)).resolves.toBe(false)
    expect(wallet.settle).not.toHaveBeenCalled()
  })

  it('does nothing when the deposits are below dust', async () => {
    vi.mocked(getConfirmedAndNotExpiredUtxos).mockResolvedValue([{ value: 100 }] as never)
    const wallet = makeWallet()

    await expect(settleBoardingUtxos(wallet, dust)).resolves.toBe(false)
    expect(wallet.settle).not.toHaveBeenCalled()
  })
})
