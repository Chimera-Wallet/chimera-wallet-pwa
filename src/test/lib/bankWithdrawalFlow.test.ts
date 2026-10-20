import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IWallet } from '@arkade-os/sdk'
import {
  createBankWithdraw,
  getBankOrderStatus,
  getBankTransferProvider,
  reportBankWithdrawalFunding,
  type BankOrder,
} from '../../providers/bankTransfer'
import { sendOffChain } from '../../lib/asp'
import { decodeArkAddress } from '../../lib/address'
import { clearPendingBankWithdrawal, getPendingBankWithdrawal, savePendingBankWithdrawal } from '../../lib/bankWithdrawalAttempt'
import { getBankOrderHistory } from '../../lib/bankOrderHistory'
import {
  fundBankWithdrawal,
  resolvePendingBankWithdrawal,
  WithdrawalWalletNotConfiguredError,
} from '../../lib/bankWithdrawalFlow'
import fixtures from '../fixtures.json'

vi.mock('../../providers/bankTransfer', () => ({
  createBankWithdraw: vi.fn(),
  getBankOrderStatus: vi.fn(),
  reportBankWithdrawalFunding: vi.fn(),
  // the returned deposit addresses and txid reports below are ramp's behaviour
  getBankTransferProvider: vi.fn(() => 'ramp'),
}))
vi.mock('../../lib/asp', () => ({ sendOffChain: vi.fn() }))

const depositAddress = fixtures.lib.address.ark[0].address
const signerPubkey = decodeArkAddress(depositAddress).serverPubKey
const order = (status: string) => ({ id: 'order-1', status }) as BankOrder
const svcWallet = {} as IWallet

const input = {
  svcWallet,
  signerPubkey,
  asset: 'BTC',
  currency: 'EUR' as const,
  circuit: 'sepa' as const,
  amountSats: 25_000,
  email: 'user@example.com',
}

describe('resolvePendingBankWithdrawal', () => {
  afterEach(() => {
    clearPendingBankWithdrawal()
    vi.clearAllMocks()
  })

  const pending = (fundingState: 'funding' | 'funded') =>
    savePendingBankWithdrawal({ order: order('WAITING_FOR_DEPOSIT'), fundingAddress: depositAddress, amountSats: 1, fundingState })

  it('reports nothing pending without asking the backend', async () => {
    expect(await resolvePendingBankWithdrawal()).toEqual({ kind: 'none' })
    expect(getBankOrderStatus).not.toHaveBeenCalled()
  })

  it('clears the slot once the order has settled or progressed', async () => {
    pending('funded')
    vi.mocked(getBankOrderStatus).mockResolvedValueOnce(order('COMPLETED'))
    expect(await resolvePendingBankWithdrawal()).toMatchObject({ kind: 'settled' })
    expect(getPendingBankWithdrawal()).toBeUndefined()

    pending('funded')
    vi.mocked(getBankOrderStatus).mockResolvedValueOnce(order('PROCESSING'))
    expect(await resolvePendingBankWithdrawal()).toMatchObject({ kind: 'progressed' })
    expect(getPendingBankWithdrawal()).toBeUndefined()
  })

  it('keeps the slot and reports the funding state while awaiting the deposit', async () => {
    pending('funding')
    vi.mocked(getBankOrderStatus).mockResolvedValueOnce(order('WAITING_FOR_DEPOSIT'))
    expect(await resolvePendingBankWithdrawal()).toMatchObject({ kind: 'awaiting', fundingState: 'funding' })
    expect(getPendingBankWithdrawal()).toBeDefined()
    expect(reportBankWithdrawalFunding).not.toHaveBeenCalled()
  })

  it('re-reports the txid of a funded order the provider has not credited', async () => {
    savePendingBankWithdrawal({
      order: order('WAITING_FOR_DEPOSIT'),
      fundingAddress: depositAddress,
      amountSats: 1,
      fundingState: 'funded',
      txid: 'funding-txid',
    })
    vi.mocked(getBankOrderStatus).mockResolvedValueOnce(order('WAITING_FOR_DEPOSIT'))
    vi.mocked(reportBankWithdrawalFunding).mockResolvedValueOnce(order('DEPOSIT_RECEIVED'))

    expect(await resolvePendingBankWithdrawal()).toMatchObject({ kind: 'progressed', order: { status: 'DEPOSIT_RECEIVED' } })
    expect(reportBankWithdrawalFunding).toHaveBeenCalledWith('order-1', 'funding-txid')
    expect(getPendingBankWithdrawal()).toBeUndefined()
  })

  it('keeps awaiting when the re-report fails', async () => {
    savePendingBankWithdrawal({
      order: order('WAITING_FOR_DEPOSIT'),
      fundingAddress: depositAddress,
      amountSats: 1,
      fundingState: 'funded',
      txid: 'funding-txid',
    })
    vi.mocked(getBankOrderStatus).mockResolvedValueOnce(order('WAITING_FOR_DEPOSIT'))
    vi.mocked(reportBankWithdrawalFunding).mockRejectedValueOnce(new Error('offline'))

    expect(await resolvePendingBankWithdrawal()).toMatchObject({ kind: 'awaiting', fundingState: 'funded' })
    expect(getPendingBankWithdrawal()?.txid).toBe('funding-txid')
  })
})

describe('fundBankWithdrawal', () => {
  afterEach(() => {
    clearPendingBankWithdrawal()
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('records the attempt before paying and marks it funded after', async () => {
    vi.mocked(createBankWithdraw).mockResolvedValue({ order: order('WAITING_FOR_DEPOSIT'), depositCryptoAddress: depositAddress })
    vi.mocked(sendOffChain).mockImplementation(async () => {
      // the slot must already say 'funding' while the payment is in flight
      expect(getPendingBankWithdrawal()?.fundingState).toBe('funding')
      return 'txid'
    })
    const onOrderCreated = vi.fn()

    const result = await fundBankWithdrawal({ ...input, onOrderCreated })

    expect(result).toEqual(order('WAITING_FOR_DEPOSIT'))
    expect(sendOffChain).toHaveBeenCalledWith(svcWallet, 25_000, depositAddress)
    expect(getPendingBankWithdrawal()).toMatchObject({ fundingState: 'funded', txid: 'txid' })
    expect(onOrderCreated).toHaveBeenCalledWith(order('WAITING_FOR_DEPOSIT'))
    expect(getBankOrderHistory()[0]).toMatchObject({ type: 'send', circuit: 'sepa' })
  })

  it('reports the funding txid so the provider can credit the order', async () => {
    vi.mocked(createBankWithdraw).mockResolvedValue({ order: order('WAITING_FOR_DEPOSIT'), depositCryptoAddress: depositAddress })
    vi.mocked(sendOffChain).mockResolvedValue('funding-txid')

    await fundBankWithdrawal(input)

    expect(reportBankWithdrawalFunding).toHaveBeenCalledWith('order-1', 'funding-txid')
  })

  it('still succeeds when the report fails, keeping the txid to report again', async () => {
    vi.mocked(createBankWithdraw).mockResolvedValue({ order: order('WAITING_FOR_DEPOSIT'), depositCryptoAddress: depositAddress })
    vi.mocked(sendOffChain).mockResolvedValue('funding-txid')
    vi.mocked(reportBankWithdrawalFunding).mockRejectedValueOnce(new Error('ramp unavailable'))

    await expect(fundBankWithdrawal(input)).resolves.toEqual(order('WAITING_FOR_DEPOSIT'))
    expect(getPendingBankWithdrawal()).toMatchObject({ fundingState: 'funded', txid: 'funding-txid' })
  })

  it('refuses a deposit address that belongs to another Ark server, before paying', async () => {
    vi.mocked(createBankWithdraw).mockResolvedValue({ order: order('WAITING_FOR_DEPOSIT'), depositCryptoAddress: depositAddress })

    await expect(fundBankWithdrawal({ ...input, signerPubkey: '00'.repeat(32) })).rejects.toThrow('different Ark server')
    expect(sendOffChain).not.toHaveBeenCalled()
  })

  it('fails before registering an order when the legacy funding wallet is not configured', async () => {
    vi.mocked(getBankTransferProvider).mockReturnValueOnce('chimera')

    await expect(fundBankWithdrawal(input)).rejects.toBeInstanceOf(WithdrawalWalletNotConfiguredError)
    expect(createBankWithdraw).not.toHaveBeenCalled()
    expect(sendOffChain).not.toHaveBeenCalled()
  })

  it('leaves the attempt in the funding state when the payment fails', async () => {
    vi.mocked(createBankWithdraw).mockResolvedValue({ order: order('WAITING_FOR_DEPOSIT'), depositCryptoAddress: depositAddress })
    vi.mocked(sendOffChain).mockRejectedValue(new Error('network down'))

    await expect(fundBankWithdrawal(input)).rejects.toThrow('network down')
    expect(getPendingBankWithdrawal()?.fundingState).toBe('funding')
  })
})
