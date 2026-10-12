import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import AppPos, { AppPosPayout } from '../../../screens/Apps/Pos/Index'
import { ConfigContext } from '../../../providers/config'
import { FiatContext } from '../../../providers/fiat'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { getPosPayments, getPosSettings, savePosSettings, defaultPosSettings } from '../../../lib/pos'
import { mockConfigContextValue, mockNavigationContextValue } from '../mocks'

// 1 EUR/CHF/USD = 1,000 sats keeps the arithmetic readable
const fiatContext = {
  fiatDecimals: () => 2,
  fromFiat: (fiat = 0) => Math.round(fiat * 1000),
  toFiat: (sats = 0) => sats / 1000,
  fromCurrency: (fiat: number) => Math.round(fiat * 1000),
  toCurrency: (sats: number) => sats / 1000,
  updateFiatPrices: () => {},
}

function renderPos(ui: React.ReactElement = <AppPos />) {
  const navigate = vi.fn()
  const goBack = vi.fn()
  render(
    <ConfigContext.Provider value={mockConfigContextValue}>
      <FiatContext.Provider value={fiatContext}>
        <NavigationContext.Provider value={{ ...mockNavigationContextValue, navigate, goBack }}>
          {ui}
        </NavigationContext.Provider>
      </FiatContext.Provider>
    </ConfigContext.Provider>,
  )
  return { navigate, goBack }
}

const press = (...keys: string[]) => keys.forEach((k) => fireEvent.click(screen.getByTestId(`pos-key-${k}`)))

describe('POS onboarding', () => {
  afterEach(() => localStorage.clear())

  it('shows the welcome page first, which continues to the payout setup', () => {
    const { navigate } = renderPos()

    expect(screen.getByTestId('pos-welcome')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('pos-get-started'))

    expect(navigate).toHaveBeenCalledWith(Pages.AppPosPayout)
  })

  it('shows the terminal once set up', () => {
    savePosSettings({ ...defaultPosSettings, onboarded: true })
    renderPos()
    expect(screen.getByTestId('pos-amount')).toHaveTextContent('0')
  })

  it('saves a BTC payout and returns', () => {
    const { goBack } = renderPos(<AppPosPayout />)

    // payout currency choice: Bitcoin, Swiss Franc, Euro
    expect(screen.getByTestId('pos-payout-BTC')).toBeInTheDocument()
    expect(screen.getByTestId('pos-payout-CHF')).toBeInTheDocument()
    expect(screen.getByTestId('pos-payout-EUR')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('pos-payout-BTC'))
    fireEvent.click(screen.getByTestId('pos-payout-btc-continue'))

    expect(getPosSettings()).toMatchObject({ onboarded: true, payoutCurrency: 'BTC' })
    expect(goBack).toHaveBeenCalled()
  })

  it('requires a complete bank account before saving a fiat payout', () => {
    const { goBack } = renderPos(<AppPosPayout />)
    fireEvent.click(screen.getByTestId('pos-payout-EUR'))

    // KYC-free limit page, then bank details
    expect(screen.getByText('apps.pos.payout.kycText')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('pos-payout-kyc-continue'))

    const save = screen.getByTestId('pos-payout-save')
    expect(save).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('DE89 3704 0044 0532 0130 00'), { target: { value: 'de89370400440532013000' } })
    fireEvent.change(screen.getByPlaceholderText('John Doe'), { target: { value: 'Jane Doe' } })
    expect(save).not.toBeDisabled()
    fireEvent.click(save)

    expect(getPosSettings()).toMatchObject({
      onboarded: true,
      payoutCurrency: 'EUR',
      circuit: 'sepa',
      bankData: { circuit: 'sepa', destinationBankAddress: 'DE89370400440532013000', accountHolderName: 'Jane Doe' },
    })
    expect(goBack).toHaveBeenCalled()
  })
})

describe('POS terminal', () => {
  afterEach(() => localStorage.clear())

  it('creates a sale with the fiat value fixed and opens the payment QR', () => {
    savePosSettings({ ...defaultPosSettings, onboarded: true })
    const { navigate } = renderPos()

    // default unit is the display fiat (EUR in the mock config)
    expect(screen.getByTestId('pos-unit')).toHaveTextContent('EUR')
    press('1', '2', '.', '5', '0', '9')
    expect(screen.getByTestId('pos-amount')).toHaveTextContent('12.50')

    fireEvent.click(screen.getByTestId('pos-note'))
    fireEvent.change(screen.getByTestId('pos-note-input'), { target: { value: 'Two coffees' } })
    fireEvent.click(screen.getByText('apps.pos.terminal.saveNote'))

    fireEvent.click(screen.getByTestId('pos-confirm'))

    const [payment] = getPosPayments()
    expect(payment).toMatchObject({
      status: 'pending',
      note: 'Two coffees',
      method: 'ark',
      sats: 12_500,
      fiatAmount: 12.5,
      fiatCurrency: 'EUR',
      payoutCurrency: 'BTC',
    })
    expect(navigate).toHaveBeenCalledWith(Pages.AppPosPayment, { paymentId: payment.id })
    // ready for the next customer
    expect(screen.getByTestId('pos-amount')).toHaveTextContent('0')
  })

  it('switches the input unit, converting the amount, and drops the decimal key for sats', () => {
    savePosSettings({ ...defaultPosSettings, onboarded: true })
    renderPos()

    press('2')
    fireEvent.click(screen.getByTestId('pos-unit')) // EUR -> BTC
    expect(screen.getByTestId('pos-unit')).toHaveTextContent('BTC')
    expect(screen.getByTestId('pos-amount')).toHaveTextContent('0.00002')

    fireEvent.click(screen.getByTestId('pos-unit')) // BTC -> SATS
    expect(screen.getByTestId('pos-amount')).toHaveTextContent('2000')
    expect(screen.queryByTestId('pos-key-.')).not.toBeInTheDocument()
  })

  it('discards the amount and note', () => {
    savePosSettings({ ...defaultPosSettings, onboarded: true })
    renderPos()

    press('9', '9')
    fireEvent.click(screen.getByTestId('pos-discard'))

    expect(screen.getByTestId('pos-amount')).toHaveTextContent('0')
    expect(getPosPayments()).toHaveLength(0)
  })

  it('blocks fiat payouts below the bank transfer minimum', () => {
    savePosSettings({
      ...defaultPosSettings,
      onboarded: true,
      payoutCurrency: 'EUR',
      circuit: 'sepa',
      bankData: { circuit: 'sepa', destinationBankAddress: 'DE89', accountHolderName: 'Jane' },
    })
    const { navigate } = renderPos()

    press('5')
    fireEvent.click(screen.getByTestId('pos-confirm'))

    expect(screen.getByText('Minimum amount is 15 EUR')).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
    expect(getPosPayments()).toHaveLength(0)
  })

  it('sends an unconfigured fiat payout back to the payout setup', () => {
    savePosSettings({ ...defaultPosSettings, onboarded: true, payoutCurrency: 'CHF' })
    const { navigate } = renderPos()

    press('5', '0')
    fireEvent.click(screen.getByTestId('pos-confirm'))

    expect(navigate).toHaveBeenCalledWith(Pages.AppPosPayout)
    expect(getPosPayments()).toHaveLength(0)
  })
})
