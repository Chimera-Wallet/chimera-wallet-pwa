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
  addUnreportedBankDeposit,
  getUnreportedBankDeposits,
  UNREPORTED_DEPOSIT_MAX_AGE_MS,
} from '../../lib/bankDepositReports'
import { consoleError } from '../../lib/logs'
import {
  btcAmountToSats,
  fundBankWithdrawal,
  resolvePendingBankWithdrawal,
  retryUnreportedBankDeposits,
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
vi.mock('../../lib/logs', () => ({ consoleError: vi.fn() }))

const depositAddress = fixtures.lib.address.ark[0].address
const signerPubkey = decodeArkAddress(depositAddress).serverPubKey
const order = (status: string, overrides: Partial<BankOrder> = {}) =>
  ({ id: 'order-1', status, direction: 'offramp', crypto_amount: '0.00025000', ...overrides }) as BankOrder
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

describe('btcAmountToSats', () => {
  it('converts decimal BTC strings to sats exactly', () => {
    expect(btcAmountToSats('0.00012345')).toBe(12_345)
    expect(btcAmountToSats('1')).toBe(100_000_000)
    expect(btcAmountToSats('0.1')).toBe(10_000_000)
    // float math would give 29_999_999.999999996 here
    expect(btcAmountToSats('0.29999999')).toBe(29_999_999)
    expect(btcAmountToSats('0.000123450000')).toBe(12_345)
  })

  it('rejects anything that is not a plain amount in whole sats', () => {
    for (const bad of [null, undefined, '', 'abc', '-0.0001', '1e-4', '0.000123451', '.5', '0x10', '99999999999']) {
      expect(btcAmountToSats(bad)).toBeUndefined()
    }
  })
})

describe('resolvePendingBankWithdrawal', () => {
  afterEach(() => {
    clearPendingBankWithdrawal()
    localStorage.clear()
    vi.clearAllMocks()
  })

  const pending = (fundingState: 'funding' | 'funded') =>
    savePendingBankWithdrawal({ order: order('WAITING_FOR_DEPOSIT'), fundingAddress: depositAddress, amountSats: 1, fundingState })

  const funded = () =>
    savePendingBankWithdrawal({
      order: order('WAITING_FOR_DEPOSIT'),
      fundingAddress: depositAddress,
      amountSats: 1,
      fundingState: 'funded',
      txid: 'funding-txid',
    })

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
    funded()
    vi.mocked(getBankOrderStatus).mockResolvedValueOnce(order('WAITING_FOR_DEPOSIT'))
    vi.mocked(reportBankWithdrawalFunding).mockResolvedValueOnce(order('DEPOSIT_RECEIVED'))

    expect(await resolvePendingBankWithdrawal()).toMatchObject({ kind: 'progressed', order: { status: 'DEPOSIT_RECEIVED' } })
    expect(reportBankWithdrawalFunding).toHaveBeenCalledWith('order-1', 'funding-txid')
    expect(getPendingBankWithdrawal()).toBeUndefined()
    expect(getUnreportedBankDeposits()).toEqual([])
  })

  it('keeps awaiting when the re-report fails, listing the txid for the background retry', async () => {
    funded()
    vi.mocked(getBankOrderStatus).mockResolvedValueOnce(order('WAITING_FOR_DEPOSIT'))
    vi.mocked(reportBankWithdrawalFunding).mockRejectedValueOnce(new Error('offline'))

    expect(await resolvePendingBankWithdrawal()).toMatchObject({ kind: 'awaiting', fundingState: 'funded' })
    expect(getPendingBankWithdrawal()?.txid).toBe('funding-txid')
    expect(getUnreportedBankDeposits()).toMatchObject([{ orderId: 'order-1', txid: 'funding-txid' }])
  })
})

describe('fundBankWithdrawal', () => {
  afterEach(() => {
    clearPendingBankWithdrawal()
    localStorage.clear()
    vi.clearAllMocks()
  })

  const created = (overrides: Partial<BankOrder> = {}) =>
    vi.mocked(createBankWithdraw).mockResolvedValue({
      order: order('WAITING_FOR_DEPOSIT', overrides),
      depositCryptoAddress: depositAddress,
    })

  it('records the attempt before paying and marks it funded after', async () => {
    created()
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

  it("pays ramp's adjusted amount, not the requested one", async () => {
    created({ crypto_amount: '0.00024877' })
    vi.mocked(sendOffChain).mockResolvedValue('txid')

    await fundBankWithdrawal(input)

    expect(sendOffChain).toHaveBeenCalledWith(svcWallet, 24_877, depositAddress)
    expect(getPendingBankWithdrawal()).toMatchObject({ amountSats: 24_877, fundingState: 'funded' })
  })

  it('accepts the largest adjustment ramp may make', async () => {
    created({ crypto_amount: '0.00024000' })
    vi.mocked(sendOffChain).mockResolvedValue('txid')

    await fundBankWithdrawal(input)

    expect(sendOffChain).toHaveBeenCalledWith(svcWallet, 24_000, depositAddress)
  })

  it.each([
    ['more than requested', { crypto_amount: '0.00025001' }],
    ['lowered by more than ramp may', { crypto_amount: '0.00023999' }],
    ['zero', { crypto_amount: '0' }],
    ['missing', { crypto_amount: null }],
    ['not a plain amount', { crypto_amount: '2.5e-4' }],
    ['for the wrong direction', { direction: 'onramp' as const }],
  ])('refuses an order whose amount is %s, before paying', async (_, overrides) => {
    created(overrides)
    const onOrderCreated = vi.fn()

    await expect(fundBankWithdrawal({ ...input, onOrderCreated })).rejects.toThrow('Nothing was sent')
    expect(sendOffChain).not.toHaveBeenCalled()
    expect(onOrderCreated).not.toHaveBeenCalled()
    expect(getPendingBankWithdrawal()).toBeUndefined()
  })

  it('reports the funding txid so the provider can credit the order', async () => {
    created()
    vi.mocked(sendOffChain).mockResolvedValue('funding-txid')

    await fundBankWithdrawal(input)

    expect(reportBankWithdrawalFunding).toHaveBeenCalledWith('order-1', 'funding-txid')
    expect(getUnreportedBankDeposits()).toEqual([])
  })

  it('returns the credited order once the report got through', async () => {
    created()
    vi.mocked(sendOffChain).mockResolvedValue('funding-txid')
    vi.mocked(reportBankWithdrawalFunding).mockResolvedValueOnce(order('DEPOSIT_RECEIVED'))

    await expect(fundBankWithdrawal(input)).resolves.toMatchObject({ status: 'DEPOSIT_RECEIVED' })
  })

  it('lists the txid as unreported before reporting it', async () => {
    created()
    vi.mocked(sendOffChain).mockResolvedValue('funding-txid')
    vi.mocked(reportBankWithdrawalFunding).mockImplementationOnce(async () => {
      expect(getUnreportedBankDeposits()).toMatchObject([{ orderId: 'order-1', txid: 'funding-txid' }])
      return undefined
    })

    await fundBankWithdrawal(input)

    expect(reportBankWithdrawalFunding).toHaveBeenCalled()
  })

  it('still succeeds when the report fails, keeping the txid to report again', async () => {
    created()
    vi.mocked(sendOffChain).mockResolvedValue('funding-txid')
    vi.mocked(reportBankWithdrawalFunding).mockRejectedValueOnce(new Error('ramp unavailable'))

    await expect(fundBankWithdrawal(input)).resolves.toEqual(order('WAITING_FOR_DEPOSIT'))
    expect(getPendingBankWithdrawal()).toMatchObject({ fundingState: 'funded', txid: 'funding-txid' })
    expect(getUnreportedBankDeposits()).toMatchObject([{ orderId: 'order-1', txid: 'funding-txid' }])
  })

  it('still succeeds when logging the failed report throws too', async () => {
    created()
    vi.mocked(sendOffChain).mockResolvedValue('funding-txid')
    vi.mocked(reportBankWithdrawalFunding).mockRejectedValueOnce(new Error('ramp unavailable'))
    vi.mocked(consoleError).mockImplementationOnce(() => {
      throw new Error('QuotaExceededError')
    })

    await expect(fundBankWithdrawal(input)).resolves.toEqual(order('WAITING_FOR_DEPOSIT'))
  })

  it('keeps the next withdrawal from losing an unreported txid', async () => {
    created()
    vi.mocked(sendOffChain).mockResolvedValueOnce('first-txid').mockResolvedValueOnce('second-txid')
    vi.mocked(reportBankWithdrawalFunding).mockRejectedValueOnce(new Error('offline'))
    await fundBankWithdrawal(input)

    created({ id: 'order-2' })
    await fundBankWithdrawal(input)

    // the slot now holds the second order, the first txid is still listed
    expect(getPendingBankWithdrawal()?.order.id).toBe('order-2')
    expect(getUnreportedBankDeposits()).toMatchObject([{ orderId: 'order-1', txid: 'first-txid' }])
  })

  it('refuses a deposit address that belongs to another Ark server, before paying', async () => {
    created()

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
    created()
    vi.mocked(sendOffChain).mockRejectedValue(new Error('network down'))

    await expect(fundBankWithdrawal(input)).rejects.toThrow('network down')
    expect(getPendingBankWithdrawal()?.fundingState).toBe('funding')
    expect(getUnreportedBankDeposits()).toEqual([])
  })
})

describe('fundBankWithdrawal on the legacy provider', () => {
  afterEach(() => {
    localStorage.clear()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('pays the requested amount to the shared wallet, whatever the order says', async () => {
    // COMPANY_WALLET is read at import time, so load a fresh copy with it set
    vi.stubEnv('VITE_BANK_WITHDRAW_WALLET', depositAddress)
    vi.resetModules()
    const provider = await import('../../providers/bankTransfer')
    const asp = await import('../../lib/asp')
    const flow = await import('../../lib/bankWithdrawalFlow')
    vi.mocked(provider.getBankTransferProvider).mockReturnValue('chimera')
    vi.mocked(provider.createBankWithdraw).mockResolvedValue({
      order: order('WAITING_FOR_DEPOSIT', { crypto_amount: '0.0001' }),
    })
    vi.mocked(asp.sendOffChain).mockResolvedValue('txid')

    await flow.fundBankWithdrawal(input)

    expect(asp.sendOffChain).toHaveBeenCalledWith(svcWallet, 25_000, depositAddress)
  })
})

describe('retryUnreportedBankDeposits', () => {
  afterEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('does nothing when no txid is waiting to be reported', async () => {
    await retryUnreportedBankDeposits()
    expect(getBankOrderStatus).not.toHaveBeenCalled()
  })

  it('reports a txid whose order still waits, dropping it once that went through', async () => {
    addUnreportedBankDeposit('order-1', 'txid-1')
    vi.mocked(getBankOrderStatus).mockResolvedValueOnce(order('WAITING_FOR_DEPOSIT'))
    vi.mocked(reportBankWithdrawalFunding).mockResolvedValueOnce(order('DEPOSIT_RECEIVED'))

    await retryUnreportedBankDeposits()

    expect(getBankOrderStatus).toHaveBeenCalledWith('order-1', 'offramp')
    expect(reportBankWithdrawalFunding).toHaveBeenCalledWith('order-1', 'txid-1')
    expect(getUnreportedBankDeposits()).toEqual([])
  })

  it('keeps the txid when the report fails, or the status check does', async () => {
    addUnreportedBankDeposit('order-1', 'txid-1')
    addUnreportedBankDeposit('order-2', 'txid-2')
    vi.mocked(getBankOrderStatus)
      .mockResolvedValueOnce(order('WAITING_FOR_DEPOSIT'))
      .mockRejectedValueOnce(new Error('offline'))
    vi.mocked(reportBankWithdrawalFunding).mockRejectedValueOnce(new Error('offline'))

    await expect(retryUnreportedBankDeposits()).resolves.toBeUndefined()

    expect(getUnreportedBankDeposits().map((e) => e.orderId)).toEqual(['order-1', 'order-2'])
  })

  it('drops a txid without reporting it once its order has moved on', async () => {
    addUnreportedBankDeposit('order-1', 'txid-1')
    vi.mocked(getBankOrderStatus).mockResolvedValueOnce(order('PROCESSING'))

    await retryUnreportedBankDeposits()

    expect(reportBankWithdrawalFunding).not.toHaveBeenCalled()
    expect(getUnreportedBankDeposits()).toEqual([])
  })

  it.each(['EXPIRED', 'REJECTED', 'FAILED'])(
    'reports once more for an order that ended %s, then drops it whatever the result',
    async (status) => {
      addUnreportedBankDeposit('order-1', 'txid-1')
      vi.mocked(getBankOrderStatus).mockResolvedValueOnce(order(status))
      vi.mocked(reportBankWithdrawalFunding).mockRejectedValueOnce(new Error('order is not awaiting a deposit'))

      await retryUnreportedBankDeposits()

      expect(reportBankWithdrawalFunding).toHaveBeenCalledWith('order-1', 'txid-1')
      expect(getUnreportedBankDeposits()).toEqual([])
    },
  )

  it('drops entries older than the maximum age without asking the provider', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    addUnreportedBankDeposit('order-1', 'txid-1')
    vi.setSystemTime(UNREPORTED_DEPOSIT_MAX_AGE_MS + 1)

    await retryUnreportedBankDeposits()

    expect(getBankOrderStatus).not.toHaveBeenCalled()
    expect(getUnreportedBankDeposits()).toEqual([])
  })

  it('shares one run between overlapping calls', async () => {
    addUnreportedBankDeposit('order-1', 'txid-1')
    vi.mocked(getBankOrderStatus).mockResolvedValue(order('PROCESSING'))

    await Promise.all([retryUnreportedBankDeposits(), retryUnreportedBankDeposits()])

    expect(getBankOrderStatus).toHaveBeenCalledTimes(1)
  })
})
