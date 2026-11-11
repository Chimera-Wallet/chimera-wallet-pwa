import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  estimateCardWithdrawal,
  executeCardWithdrawal,
  getWirexWithdrawalRequests,
  type WirexCard,
  type WirexWithdrawalRequest,
} from '../../lib/wirex'
import { finishWirexWithdrawal, withdrawFromWirexWallet } from '../../lib/wirexWallet'
import {
  cardHoldsBalance,
  finishPendingWirexWithdrawal,
  getPendingWirexWithdrawals,
  msUntilDue,
  runWirexWithdrawal,
} from '../../screens/Apps/WirexCard/withdraw'

vi.mock('../../lib/wirex', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/wirex')>()),
  estimateCardWithdrawal: vi.fn(),
  executeCardWithdrawal: vi.fn(),
  getWirexWithdrawalRequests: vi.fn(),
}))

vi.mock('../../lib/wirexWallet', () => ({
  withdrawFromWirexWallet: vi.fn(),
  finishWirexWithdrawal: vi.fn(),
}))

const gen2Card: WirexCard = {
  id: 'card-1',
  status: 'Active',
  card_data: { payment_system: 'Visa', format: 'Virtual' },
  generation: 'Gen2',
  card_wallet_address: '0xCard',
  provider: 'Wirex',
  created_at: '',
  updated_at: '',
  allowed_actions: [],
}
const gen1Card: WirexCard = {
  ...gen2Card,
  generation: 'Gen1',
  balances: [
    { balance: 25, is_active: true, reference_balance: 25, reference_currency: 'USD', token_address: '0xWusd' },
  ],
}
const wallet = { wallet_address: '0xKernel', balances: [] }
const recipient = '0x1111111111111111111111111111111111111111'
const withdrawResult = {
  txHash: '0xTx' as const,
  baseToken: { symbol: 'USDC', address: '0xUsdc' as const, decimals: 6 },
}

const request = (validAfter: string): WirexWithdrawalRequest => ({
  call_data: 'abcd',
  valid_after: validAfter,
  to_address: recipient,
  token_address: '0xUsdc',
  hash: '0xreq',
  amount: 10,
  account_address: '0xKernel',
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(withdrawFromWirexWallet).mockResolvedValue(withdrawResult)
  vi.mocked(estimateCardWithdrawal).mockResolvedValue({
    amount: 10,
    currency: 'USD',
    estimation_id: 'est-1',
    expires_at: 0,
    fee_amount: 0,
  })
  vi.mocked(executeCardWithdrawal).mockResolvedValue({ id: 'w1' })
})

describe('runWirexWithdrawal', () => {
  const run = (card: WirexCard, onStep = vi.fn()) =>
    runWirexWithdrawal({ password: 'pw', userAddress: '0xUser', card, wallet, recipient, amount: 10, onStep })

  it('withdraws straight from the wallet for a Gen2 card', async () => {
    const onStep = vi.fn()
    await expect(run(gen2Card, onStep)).resolves.toEqual(withdrawResult)
    expect(estimateCardWithdrawal).not.toHaveBeenCalled()
    expect(withdrawFromWirexWallet).toHaveBeenCalledWith('pw', { recipient, amount: 10 })
    expect(onStep.mock.calls).toEqual([['delay']])
  })

  it('moves a Gen1 card balance to the Wirex wallet first', async () => {
    const onStep = vi.fn()
    await run(gen1Card, onStep)
    expect(estimateCardWithdrawal).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: 'card-1', amount: 10, currency: 'USD', destinationAddress: '0xKernel' }),
    )
    expect(executeCardWithdrawal).toHaveBeenCalledWith('0xUser', 'card-1', 'est-1')
    expect(onStep.mock.calls).toEqual([['card'], ['delay']])
  })

  it('stops if the card withdrawal has no estimate', async () => {
    vi.mocked(estimateCardWithdrawal).mockResolvedValue(null)
    await expect(run(gen1Card)).rejects.toThrow('estimate')
    expect(withdrawFromWirexWallet).not.toHaveBeenCalled()
  })

  it('detects card-held balances', () => {
    expect(cardHoldsBalance(gen2Card)).toBe(false)
    expect(cardHoldsBalance(gen1Card)).toBe(true)
  })
})

describe('pending withdrawals', () => {
  it('computes time until a request is due', () => {
    const now = Date.parse('2026-11-11T10:00:00Z')
    expect(msUntilDue(request('2026-11-11T10:05:00Z'), now)).toBe(300_000)
    expect(msUntilDue(request('2026-11-11T09:00:00Z'), now)).toBe(0)
  })

  it('refuses to finish a request before it is due', async () => {
    const future = new Date(Date.now() + 10 * 60_000).toISOString()
    await expect(finishPendingWirexWithdrawal('pw', request(future))).rejects.toThrow('can be completed in')
    expect(finishWirexWithdrawal).not.toHaveBeenCalled()
  })

  it('finishes a due request with its call data', async () => {
    vi.mocked(finishWirexWithdrawal).mockResolvedValue('0xDone')
    await expect(finishPendingWirexWithdrawal('pw', request('2020-01-01T00:00:00Z'))).resolves.toBe('0xDone')
    expect(finishWirexWithdrawal).toHaveBeenCalledWith('pw', 'abcd')
  })

  it('treats a failed lookup as no pending withdrawals', async () => {
    vi.mocked(getWirexWithdrawalRequests).mockRejectedValue(new Error('network'))
    await expect(getPendingWirexWithdrawals('0xUser')).resolves.toEqual([])
  })
})
