import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NavigationContext, Pages, pageComponent } from '../../../providers/navigation'
import AppWirexCard from '../../../screens/Apps/WirexCard/Index'
import AppWirexMoveAssets from '../../../screens/Apps/WirexCard/MoveAssets'
import AppCardReservation from '../../../screens/Apps/CardReservation/Index'
import {
  WirexCard,
  getWirexCards,
  getWirexUserByAddress,
  getWirexWallet,
  setWirexCardBlocked,
  createCardRevealSession,
} from '../../../lib/wirex'
import {
  deployWirexKernelAccount,
  getWirexConfigCompanyId,
  getWirexEvmAddress,
  signWirexActionConfirmation,
} from '../../../lib/wirexWallet'
import { isValidPassword } from '../../../lib/privateKey'
import { createCardReveal } from '@wirexapp/card-reveal-web'
import { mockNavigationContextValue } from '../mocks'

vi.mock('../../../lib/wirex', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/wirex')>()),
  getWirexCards: vi.fn(),
  getWirexUserByAddress: vi.fn(),
  getWirexWallet: vi.fn(),
  setWirexCardBlocked: vi.fn(),
  createCardRevealSession: vi.fn(),
  estimateCardTransfer: vi.fn(),
  transferToCard: vi.fn(),
}))

vi.mock('../../../lib/wirexWallet', () => ({
  deployWirexKernelAccount: vi.fn(),
  getWirexEvmAddress: vi.fn(),
  signWirexActionConfirmation: vi.fn(),
  getWirexConfigCompanyId: vi.fn(),
}))

// Wallet without a user-defined password: the default one unlocks it.
vi.mock('../../../lib/privateKey', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/privateKey')>()),
  isValidPassword: vi.fn(async () => true),
}))

// The reveal SDK mounts Wirex's iframes; only its contract is exercised here.
const revealHandle = { mount: vi.fn(async () => {}), destroy: vi.fn(), setMasked: vi.fn() }
vi.mock('@wirexapp/card-reveal-web', () => ({ createCardReveal: vi.fn(() => revealHandle) }))

// The vaul drawer needs browser APIs jsdom lacks; render the sheet inline.
vi.mock('../../../components/SheetModal', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div data-testid='sheet'>{children}</div> : null,
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
  // The intro walkthrough precedes setup: Continue, Continue, Get your card.
  const skipWalkthrough = async () => {
    const next = await screen.findByTestId('wirex-walkthrough-next')
    for (let i = 0; i < 3; i++) fireEvent.click(next)
  }

  it('shows setup when there is no stored account', async () => {
    render(<AppWirexCard />)
    await skipWalkthrough()
    expect(await screen.findByTestId('wirex-setup-submit')).toHaveTextContent('apps.wirexCard.setup.ctaLoad')
    expect(getWirexUserByAddress).not.toHaveBeenCalled()
  })

  it('shows setup when the account has no active card', async () => {
    localStorage.setItem('wirexUserAddress', '0xUser')
    vi.mocked(getWirexUserByAddress).mockResolvedValue(user)
    vi.mocked(getWirexCards).mockResolvedValue({ data: [{ ...card, status: 'Closed' }] })
    render(<AppWirexCard />)
    await skipWalkthrough()
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

describe('Wirex setup', () => {
  const skipWalkthrough = async () => {
    const next = await screen.findByTestId('wirex-walkthrough-next')
    for (let i = 0; i < 3; i++) fireEvent.click(next)
  }
  const passwordInput = () => screen.getByTestId('wirex-setup-password').querySelector('input') as HTMLInputElement
  const submit = () => screen.getByTestId('wirex-setup-submit')
  const openTab = (tab: 'tabLoad' | 'tabCreate') => fireEvent.click(screen.getByText(`apps.wirexCard.setup.${tab}`))

  // Wallet protected by the password 'secret'.
  const withUserPassword = () => vi.mocked(isValidPassword).mockImplementation(async (pw) => pw === 'secret')

  afterEach(() => {
    cleanup()
    vi.mocked(isValidPassword).mockImplementation(async () => true)
  })

  it('shows the password section on both tabs', async () => {
    withUserPassword()
    render(<AppWirexCard />)
    await skipWalkthrough()
    await waitFor(() => expect(passwordInput()).toBeTruthy())
    openTab('tabCreate')
    expect(passwordInput()).toBeTruthy()
    expect(submit()).toHaveTextContent('apps.wirexCard.setup.ctaCreate')
  })

  it('keeps the button disabled until a password is entered', async () => {
    withUserPassword()
    render(<AppWirexCard />)
    await skipWalkthrough()
    await waitFor(() => expect(passwordInput()).toBeTruthy())
    expect(submit()).toBeDisabled()
    fireEvent.change(passwordInput(), { target: { value: 'secret' } })
    expect(submit()).not.toBeDisabled()
  })

  it('rejects a wrong password before deriving or deploying anything', async () => {
    withUserPassword()
    render(<AppWirexCard />)
    await skipWalkthrough()
    await waitFor(() => expect(passwordInput()).toBeTruthy())
    openTab('tabCreate')
    fireEvent.change(passwordInput(), { target: { value: 'nope' } })
    fireEvent.change(screen.getByTestId('wirex-setup-email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByTestId('wirex-setup-country'), { target: { value: 'gb' } })
    fireEvent.click(submit())
    expect(await screen.findByText('apps.wirexCard.withdraw.wrongPassword')).toBeInTheDocument()
    expect(getWirexEvmAddress).not.toHaveBeenCalled()
    expect(deployWirexKernelAccount).not.toHaveBeenCalled()
  })

  it('offers to create an account when none is found, keeping the password', async () => {
    withUserPassword()
    vi.mocked(getWirexEvmAddress).mockResolvedValue('0xUser')
    vi.mocked(getWirexUserByAddress).mockResolvedValue(null)
    render(<AppWirexCard />)
    await skipWalkthrough()
    await waitFor(() => expect(passwordInput()).toBeTruthy())
    fireEvent.change(passwordInput(), { target: { value: 'secret' } })
    fireEvent.click(submit())
    fireEvent.click(await screen.findByTestId('wirex-setup-create-instead'))
    expect(submit()).toHaveTextContent('apps.wirexCard.setup.ctaCreate')
    expect(passwordInput().value).toBe('secret')
    expect(getWirexEvmAddress).toHaveBeenCalledWith('secret')
  })

  it('needs no password input for a wallet without a password', async () => {
    vi.mocked(getWirexEvmAddress).mockResolvedValue('0xUser')
    vi.mocked(getWirexUserByAddress).mockResolvedValue(user)
    vi.mocked(getWirexCards).mockResolvedValue({ data: [] })
    render(<AppWirexCard />)
    await skipWalkthrough()
    expect(await screen.findByText('apps.wirexCard.setup.passwordNone')).toBeInTheDocument()
    expect(passwordInput()).toBeNull()
    await waitFor(() => expect(submit()).not.toBeDisabled())
    fireEvent.click(submit())
    await waitFor(() => expect(getWirexUserByAddress).toHaveBeenCalledWith('0xUser'))
  })
})

describe('Card freeze', () => {
  // Tests run without loaded translations: the pill falls back to the raw
  // Wirex status and labels render as their keys, so match either form.
  const FROZEN = /Frozen|Blocked/
  // Card home with an Active card loaded from a stored account.
  const renderHome = async () => {
    localStorage.setItem('wirexUserAddress', '0xUser')
    vi.mocked(getWirexUserByAddress).mockResolvedValue(user)
    vi.mocked(getWirexCards).mockResolvedValue({ data: [card] })
    render(<AppWirexCard />)
    await waitFor(() => expect(screen.getByTestId('wirex-card-status')).toHaveTextContent('Active'))
  }

  it('freezes and unfreezes the card', async () => {
    await renderHome()
    vi.mocked(setWirexCardBlocked).mockResolvedValue()
    vi.mocked(getWirexCards).mockResolvedValue({ data: [{ ...card, status: 'Blocked' }] })

    fireEvent.click(screen.getByTestId('wirex-lock'))
    await waitFor(() => expect(screen.getByTestId('wirex-card-status')).toHaveTextContent(FROZEN))
    expect(setWirexCardBlocked).toHaveBeenLastCalledWith('0xUser', 'card-1', true)
    expect(screen.getByTestId('wirex-lock')).toHaveTextContent(/unfreeze/i)

    vi.mocked(getWirexCards).mockResolvedValue({ data: [card] })
    fireEvent.click(screen.getByTestId('wirex-lock'))
    await waitFor(() => expect(screen.getByTestId('wirex-card-status')).toHaveTextContent('Active'))
    expect(setWirexCardBlocked).toHaveBeenLastCalledWith('0xUser', 'card-1', false)
    expect(screen.getByTestId('wirex-lock')).not.toHaveTextContent(/unfreeze/i)
  })

  it("assumes the freeze took effect when Wirex hasn't updated the status yet", async () => {
    await renderHome()
    vi.mocked(setWirexCardBlocked).mockResolvedValue()
    fireEvent.click(screen.getByTestId('wirex-lock'))
    await waitFor(() => expect(screen.getByTestId('wirex-card-status')).toHaveTextContent(FROZEN))
  })

  it('shows the error and keeps the status when Wirex rejects', async () => {
    await renderHome()
    vi.mocked(setWirexCardBlocked).mockRejectedValue(new Error('Card cannot be blocked'))
    fireEvent.click(screen.getByTestId('wirex-lock'))
    expect(await screen.findByText('Card cannot be blocked')).toBeInTheDocument()
    expect(screen.getByTestId('wirex-card-status')).toHaveTextContent('Active')
  })
})

describe('Card details', () => {
  const confirmation = { address: '0xUSER', nonce: 1_800_000_000, signature: '0xsig' as `0x${string}` }

  const renderHome = async () => {
    localStorage.setItem('wirexUserAddress', '0xUser')
    vi.mocked(getWirexUserByAddress).mockResolvedValue(user)
    vi.mocked(getWirexCards).mockResolvedValue({
      data: [{ ...card, card_data: { ...card.card_data, name_on_card: 'Mario Rossi' } }],
    })
    vi.mocked(signWirexActionConfirmation).mockResolvedValue(confirmation)
    vi.mocked(getWirexConfigCompanyId).mockResolvedValue('company-1')
    render(<AppWirexCard />)
    await screen.findByTestId('wirex-details')
  }

  it('signs, opens a reveal session and mounts the Wirex frames in the sheet', async () => {
    await renderHome()
    vi.mocked(createCardRevealSession).mockResolvedValue({ accessToken: 'user-token', actionToken: 'action-1' })

    fireEvent.click(screen.getByTestId('wirex-details'))

    await waitFor(() => expect(revealHandle.mount).toHaveBeenCalled())
    expect(signWirexActionConfirmation).toHaveBeenCalledWith(expect.any(String), 'GetCardDetails')
    expect(createCardRevealSession).toHaveBeenCalledWith({
      userAddress: '0xUSER',
      nonce: 1_800_000_000,
      signature: '0xsig',
    })
    const [sdk, config] = vi.mocked(createCardReveal).mock.calls[0]
    expect(sdk.clientId).toBe('company-1')
    expect(config).toMatchObject({
      cardId: 'card-1',
      actionToken: 'action-1',
      fields: ['number', 'expiry', 'cvv', 'cardholder'],
      cardholderName: 'Mario Rossi',
    })
    await expect(config.auth.getBearerToken()).resolves.toBe('user-token')
    expect(revealHandle.mount).toHaveBeenCalledWith(screen.getByTestId('wirex-card-details-frame'))
    expect(screen.getByTestId('wirex-card-details')).toHaveTextContent(/apps.wirexCard.cardDetails.warning|Never share/)
  })

  it('destroys the frames when the sheet is closed', async () => {
    await renderHome()
    vi.mocked(createCardRevealSession).mockResolvedValue({ accessToken: 'user-token', actionToken: 'action-1' })
    fireEvent.click(screen.getByTestId('wirex-details'))
    await waitFor(() => expect(revealHandle.mount).toHaveBeenCalled())

    fireEvent.click(screen.getByLabelText(/close/i))

    await waitFor(() => expect(screen.queryByTestId('wirex-card-details')).not.toBeInTheDocument())
    expect(revealHandle.destroy).toHaveBeenCalled()
  })

  it('shows the error and keeps the sheet closed when Wirex rejects the signature', async () => {
    await renderHome()
    vi.mocked(createCardRevealSession).mockRejectedValue(new Error('Wirex did not accept the signature'))
    fireEvent.click(screen.getByTestId('wirex-details'))

    expect(await screen.findByText('Wirex did not accept the signature')).toBeInTheDocument()
    expect(screen.queryByTestId('wirex-card-details')).not.toBeInTheDocument()
    expect(createCardReveal).not.toHaveBeenCalled()
  })

  it("refuses when the unlocked wallet isn't the card owner's", async () => {
    await renderHome()
    vi.mocked(signWirexActionConfirmation).mockResolvedValue({ ...confirmation, address: '0xOther' })
    fireEvent.click(screen.getByTestId('wirex-details'))

    await waitFor(() => expect(signWirexActionConfirmation).toHaveBeenCalled())
    expect(createCardRevealSession).not.toHaveBeenCalled()
    expect(screen.queryByTestId('wirex-card-details')).not.toBeInTheDocument()
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

  it('flips direction, keeping the amount and swapping the FROM / TO rows', async () => {
    renderMove('fromCard')
    await waitFor(() => expect(getWirexWallet).toHaveBeenCalled())
    type('7')
    // Translations aren't loaded in tests: labels render as their keys.
    expect(screen.getByTestId('wirex-row-card')).toHaveTextContent(/transfer\.from|From/)
    expect(screen.getByTestId('wirex-row-token')).toHaveTextContent(/transfer\.to|To/)
    fireEvent.click(screen.getByTestId('wirex-flip'))
    expect(screen.getByTestId('wirex-row-token')).toHaveTextContent(/transfer\.from|From/)
    expect(screen.getByTestId('wirex-row-card')).toHaveTextContent(/transfer\.to|To/)
    expect(amountInput()).toHaveValue('7')
  })
})

describe('Card selection', () => {
  const travel: WirexCard = { ...card, card_data: { ...card.card_data, card_name: 'Travel' } }
  const shopping: WirexCard = {
    ...card,
    id: 'card-2',
    status: 'Blocked',
    card_data: { ...card.card_data, card_name: 'Shopping' },
  }

  const renderHome = async (cards: WirexCard[]) => {
    localStorage.setItem('wirexUserAddress', '0xUser')
    vi.mocked(getWirexUserByAddress).mockResolvedValue(user)
    vi.mocked(getWirexCards).mockResolvedValue({ data: cards })
    render(<AppWirexCard />)
    await screen.findByTestId('wirex-card-status')
  }

  it('hides the picker when the user has a single card', async () => {
    await renderHome([card, { ...card, id: 'card-closed', status: 'Closed' }])
    expect(screen.queryByTestId('wirex-card-select')).not.toBeInTheDocument()
  })

  it('switches card, remembers the choice and acts on the selected card', async () => {
    await renderHome([travel, shopping])
    expect(screen.getByTestId('wirex-card-select')).toHaveTextContent('Travel')
    expect(screen.getByTestId('wirex-card-status')).toHaveTextContent('Active')

    fireEvent.click(screen.getByTestId('wirex-card-select'))
    fireEvent.click(await screen.findByText('Shopping'))

    await waitFor(() => expect(screen.getByTestId('wirex-card-select')).toHaveTextContent('Shopping'))
    expect(screen.getByTestId('wirex-card-status')).toHaveTextContent(/Frozen|Blocked/)
    expect(localStorage.getItem('wirexSelectedCardId')).toBe('card-2')

    vi.mocked(setWirexCardBlocked).mockResolvedValue()
    vi.mocked(getWirexCards).mockResolvedValue({ data: [travel, { ...shopping, status: 'Active' }] })
    fireEvent.click(screen.getByTestId('wirex-lock'))
    await waitFor(() => expect(screen.getByTestId('wirex-card-status')).toHaveTextContent('Active'))
    expect(setWirexCardBlocked).toHaveBeenLastCalledWith('0xUser', 'card-2', false)
  })

  it('opens on the remembered card and ignores a remembered card that was closed', async () => {
    localStorage.setItem('wirexSelectedCardId', 'card-2')
    await renderHome([travel, shopping])
    expect(screen.getByTestId('wirex-card-select')).toHaveTextContent('Shopping')
    cleanup()

    localStorage.setItem('wirexSelectedCardId', 'card-2')
    await renderHome([travel, { ...shopping, status: 'Closed' }, { ...card, id: 'card-3' }])
    expect(screen.getByTestId('wirex-card-select')).toHaveTextContent('Travel')
  })
})
