import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NavigationContext, Pages, pageComponent } from '../../../providers/navigation'
import AppWirexCard from '../../../screens/Apps/WirexCard/Index'
import AppWirexMoveAssets from '../../../screens/Apps/WirexCard/MoveAssets'
import AppCardReservation from '../../../screens/Apps/CardReservation/Index'
import { WirexCard, getWirexCards, getWirexUserByAddress, getWirexWallet } from '../../../lib/wirex'
import { mockNavigationContextValue } from '../mocks'

vi.mock('../../../lib/wirex', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/wirex')>()),
  getWirexCards: vi.fn(),
  getWirexUserByAddress: vi.fn(),
  getWirexWallet: vi.fn(),
  estimateCardTransfer: vi.fn(),
  transferToCard: vi.fn(),
}))

vi.mock('../../../lib/wirexWallet', () => ({
  deployWirexKernelAccount: vi.fn(),
  getWirexEvmAddress: vi.fn(),
}))

const user = { user_id: 'u1', user_address: '0xUser', chain_id: 1, email: 'user@test.com' }

const card: WirexCard = {
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

const wallet = {
  wallet_address: '0xWallet',
  balances: [
    { token_symbol: 'WUSD', token_address: '0xWusd', balance: 100 },
    // Raw USDT isn't card balance until Wirex converts it to WUSD.
    { token_symbol: 'USDT', token_address: '0xUsdt', balance: 40 },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.mocked(getWirexWallet).mockResolvedValue(wallet)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Card tab routing', () => {
  it('shows the Wirex card screen when VITE_WIREX_ENABLED is true', () => {
    vi.stubEnv('VITE_WIREX_ENABLED', 'true')
    expect(pageComponent(Pages.AppCardReservation).type).toBe(AppWirexCard)
  })

  it('keeps the card reservation app otherwise', () => {
    vi.stubEnv('VITE_WIREX_ENABLED', 'false')
    expect(pageComponent(Pages.AppCardReservation).type).toBe(AppCardReservation)
  })
})

describe('AppWirexCard', () => {
  it('shows setup when there is no stored account', async () => {
    render(<AppWirexCard />)
    expect(await screen.findByText('Load existing account')).toBeInTheDocument()
    expect(getWirexUserByAddress).not.toHaveBeenCalled()
  })

  it('shows setup when the account has no active card', async () => {
    localStorage.setItem('wirexUserAddress', '0xUser')
    vi.mocked(getWirexUserByAddress).mockResolvedValue(user)
    vi.mocked(getWirexCards).mockResolvedValue({ data: [{ ...card, status: 'Closed' }] })
    render(<AppWirexCard />)
    expect(await screen.findByText('Issue virtual card')).toBeInTheDocument()
  })

  it('picks up an account created on the dev page and shows the card home', async () => {
    localStorage.setItem('wirexDevUserAddress', '0xUser')
    vi.mocked(getWirexUserByAddress).mockResolvedValue(user)
    vi.mocked(getWirexCards).mockResolvedValue({ data: [card] })
    render(<AppWirexCard />)
    await waitFor(() => expect(screen.getByTestId('wirex-card-balance')).toHaveTextContent('100.00'))
    expect(getWirexUserByAddress).toHaveBeenCalledWith('0xUser')
  })
})

describe('AppWirexMoveAssets', () => {
  const renderMove = (direction: 'fromCard' | 'toCard') =>
    render(
      <NavigationContext.Provider
        value={{
          ...mockNavigationContextValue,
          navigationData: { direction, userAddress: '0xUser', cardId: 'card-1' },
        }}
      >
        <AppWirexMoveAssets />
      </NavigationContext.Provider>,
    )

  const amountInput = () => screen.getByTestId('wirex-amount') as HTMLInputElement
  const type = (value: string) => fireEvent.change(amountInput(), { target: { value } })

  it('takes amounts from the native numeric input and the percentage chips', async () => {
    renderMove('fromCard')
    await waitFor(() => expect(screen.getByTestId('wirex-row-card')).toHaveTextContent('100.00'))
    expect(amountInput()).toHaveAttribute('inputmode', 'decimal')

    type('12')
    expect(amountInput()).toHaveValue('12')
    expect(screen.getByTestId('wirex-confirm')).toBeEnabled()

    fireEvent.click(screen.getByTestId('wirex-pct-25'))
    expect(amountInput()).toHaveValue('25')

    type('')
    expect(screen.getByTestId('wirex-confirm')).toBeDisabled()
  })

  it('accepts a comma decimal separator and rejects invalid input', async () => {
    renderMove('fromCard')
    await waitFor(() => expect(getWirexWallet).toHaveBeenCalled())
    type('1,5')
    expect(amountInput()).toHaveValue('1.5')
    type('1.555') // too many decimals
    type('abc')
    expect(amountInput()).toHaveValue('1.5')
  })

  it('disables confirm above the available balance', async () => {
    renderMove('fromCard')
    await waitFor(() => expect(screen.getByTestId('wirex-row-card')).toHaveTextContent('100.00'))
    type('500')
    expect(screen.getByTestId('wirex-confirm')).toBeDisabled()
  })

  it('flips direction, keeping the amount on the new source row', async () => {
    renderMove('fromCard')
    await waitFor(() => expect(getWirexWallet).toHaveBeenCalled())
    type('7')
    expect(screen.getByTestId('wirex-row-card')).toContainElement(amountInput())
    fireEvent.click(screen.getByTestId('wirex-flip'))
    expect(screen.getByTestId('wirex-row-token')).toContainElement(amountInput())
    expect(amountInput()).toHaveValue('7')
  })
})
