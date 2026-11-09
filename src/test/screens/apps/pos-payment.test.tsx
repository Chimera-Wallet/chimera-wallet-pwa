import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AppPosPayment from '../../../screens/Apps/Pos/Payment'
import AppPosStatus from '../../../screens/Apps/Pos/Status'
import PosSettlement from '../../../providers/posSettlement'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { WalletContext } from '../../../providers/wallet'
import { AspContext } from '../../../providers/asp'
import { LimitsContext } from '../../../providers/limits'
import { LnReceiveContext } from '../../../providers/lnReceive'
import { getPosPayment, POS_SALE_WINDOW_MS, updatePosPayment, type PosPayment } from '../../../lib/pos'
import { convertPosPayment, resumePosConversions } from '../../../lib/posConversion'
import {
  mockAspContextValue,
  mockLimitsContextValue,
  mockNavigationContextValue,
  mockWalletContextValue,
} from '../mocks'

const ARK_ADDRESS = 'tark1qexampleaddressforposqrcode'

vi.mock('../../../lib/asp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/asp')>()),
  getReceivingAddresses: vi.fn(async () => ({ offchainAddr: ARK_ADDRESS, boardingAddr: 'tb1qboarding' })),
}))
vi.mock('../../../lib/posConversion', () => ({
  convertPosPayment: vi.fn(async () => undefined),
  resumePosConversions: vi.fn(async () => undefined),
  isConversionInterrupted: () => false,
}))

const workerEvents = new EventTarget()
beforeAll(() => {
  Object.defineProperty(navigator, 'serviceWorker', { value: workerEvents, configurable: true })
})

const receive = (sats: number, spent: number[] = []) =>
  act(() => {
    workerEvents.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'VTXO_UPDATE',
          payload: { newVtxos: [{ value: sats }], spentVtxos: spent.map((value) => ({ value })) },
        },
      }),
    )
  })

const sale = (overrides: Partial<PosPayment> = {}) => {
  const record: PosPayment = {
    id: 'sale-1',
    createdAt: Date.now(),
    note: 'Lunch',
    method: 'ark',
    sats: 20_000,
    fiatAmount: 20,
    fiatCurrency: 'EUR',
    payoutCurrency: 'BTC',
    status: 'pending',
    openUntil: Date.now() + POS_SALE_WINDOW_MS,
    ...overrides,
  }
  localStorage.setItem('pos_payments', JSON.stringify([record]))
}

const requestReceive = vi.fn()

function renderScreen(ui: React.ReactElement) {
  const nav = {
    ...mockNavigationContextValue,
    navigate: vi.fn(),
    goBack: vi.fn(),
    popTo: vi.fn(),
    navigationData: { paymentId: 'sale-1' },
  }
  const svcWallet = {} as never
  const view = render(
    <NavigationContext.Provider value={nav}>
      <WalletContext.Provider value={{ ...mockWalletContextValue, svcWallet } as never}>
        <AspContext.Provider value={mockAspContextValue as never}>
          <LimitsContext.Provider value={mockLimitsContextValue as never}>
            <LnReceiveContext.Provider value={{ ready: true, requestReceive }}>{ui}</LnReceiveContext.Provider>
          </LimitsContext.Provider>
        </AspContext.Provider>
      </WalletContext.Provider>
    </NavigationContext.Provider>,
  )
  return { nav, ...view }
}

describe('POS payment screen', () => {
  afterEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('shows an Arkade QR for the sale', async () => {
    sale()
    renderScreen(<AppPosPayment />)
    await waitFor(() => expect(screen.getByTestId('pos-qr')).toBeInTheDocument())
    expect(screen.getByText(ARK_ADDRESS)).toBeInTheDocument()
  })

  it('moves to the status page, in its own place, once the sale is settled', async () => {
    sale()
    const { nav } = renderScreen(<AppPosPayment />)
    await waitFor(() => expect(screen.getByTestId('pos-qr')).toBeInTheDocument())

    act(() => {
      updatePosPayment('sale-1', { status: 'completed', receivedSats: 20_000 })
    })

    expect(nav.navigate).toHaveBeenCalledWith(Pages.AppPosStatus, { paymentId: 'sale-1' }, { replace: true })
  })

  it('shows a short payment while waiting for the rest', async () => {
    sale({ receivedSats: 10_000 })
    renderScreen(<AppPosPayment />)
    expect(screen.getByText('apps.pos.payment.partial')).toBeInTheDocument()
  })

  it('records the Lightning amount and keeps the sale open past the invoice expiry', async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3_600
    requestReceive.mockResolvedValue({
      rfqId: 'r',
      invoice: 'lnbc1invoice',
      payAmount: 20_000,
      expectedAmount: 19_800,
      invoiceExpiresAt: expiresAt,
    })
    sale({ method: 'lightning' })
    renderScreen(<AppPosPayment />)

    await waitFor(() => expect(getPosPayment('sale-1')?.expectedSats).toBe(19_800))
    expect(getPosPayment('sale-1')?.openUntil).toBe(expiresAt * 1000 + POS_SALE_WINDOW_MS)
  })

  it('closing keeps the sale open to a late payment', () => {
    sale()
    const { nav, unmount } = renderScreen(<AppPosPayment />)

    fireEvent.click(screen.getByTestId('pos-payment-close'))
    unmount() // what going back does

    expect(nav.goBack).toHaveBeenCalled()
    expect(getPosPayment('sale-1')).toMatchObject({ status: 'pending' })
    expect(getPosPayment('sale-1')!.openUntil).toBeGreaterThan(Date.now() + POS_SALE_WINDOW_MS - 5_000)
  })
})

describe('POS settlement service', () => {
  afterEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('settles an open sale when its payment arrives, on any screen', () => {
    sale()
    renderScreen(<PosSettlement />)

    receive(20_000)

    expect(getPosPayment('sale-1')).toMatchObject({ status: 'completed', receivedSats: 20_000 })
    // BTC payout: nothing to convert
    expect(convertPosPayment).not.toHaveBeenCalled()
  })

  it('accepts a payment slightly under the request (re-priced by the payer)', () => {
    sale()
    renderScreen(<PosSettlement />)
    receive(19_800)
    expect(getPosPayment('sale-1')).toMatchObject({ status: 'completed', receivedSats: 19_800 })
  })

  it('counts a short payment and completes the sale once topped up', () => {
    sale()
    renderScreen(<PosSettlement />)

    receive(10_000)
    expect(getPosPayment('sale-1')).toMatchObject({ status: 'pending', receivedSats: 10_000 })

    receive(10_000)
    expect(getPosPayment('sale-1')).toMatchObject({ status: 'completed', receivedSats: 20_000 })
  })

  it("ignores the wallet's own coin refreshes", () => {
    sale()
    renderScreen(<PosSettlement />)

    // batch renewal: 50k of existing coins spent, 49.9k recreated
    receive(49_900, [30_000, 20_000])

    expect(getPosPayment('sale-1')?.status).toBe('pending')
  })

  it('starts the bank conversion for fiat payouts', () => {
    sale({ payoutCurrency: 'EUR' })
    renderScreen(<PosSettlement />)

    receive(20_000)

    expect(convertPosPayment).toHaveBeenCalledWith('sale-1', expect.objectContaining({ signerPubkey: expect.any(String) }))
  })

  it('expires stale sales and resumes unfinished conversions once the wallet is ready', () => {
    sale({ openUntil: Date.now() - 1 })
    renderScreen(<PosSettlement />)

    expect(getPosPayment('sale-1')).toBeUndefined()
    expect(resumePosConversions).toHaveBeenCalled()
  })
})

describe('POS status screen', () => {
  afterEach(() => localStorage.clear())

  it('shows a completed BTC sale and returns to the terminal on close', () => {
    sale({ status: 'completed', receivedSats: 20_000 })
    const { nav } = renderScreen(<AppPosStatus />)

    expect(screen.getByTestId('pos-status-completed')).toBeInTheDocument()
    expect(screen.getByText('Lunch')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('pos-status-close'))
    expect(nav.popTo).toHaveBeenCalledWith(Pages.AppPos)
  })

  it('goes back to wherever it was opened from, while Close returns to the terminal', () => {
    sale({ status: 'completed', receivedSats: 20_000 })
    const { nav } = renderScreen(<AppPosStatus />)

    fireEvent.click(screen.getByLabelText('Go back'))
    expect(nav.goBack).toHaveBeenCalled()
    expect(nav.popTo).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('pos-status-close'))
    expect(nav.popTo).toHaveBeenCalledWith(Pages.AppPos)
  })

  it('reports a failed conversion and offers a retry', () => {
    sale({
      status: 'completed',
      receivedSats: 20_000,
      payoutCurrency: 'EUR',
      conversion: { status: 'failed', currency: 'EUR', error: 'Ramp unavailable', updatedAt: 0 },
    })
    renderScreen(<AppPosStatus />)

    expect(screen.getByTestId('pos-status-failed')).toBeInTheDocument()
    fireEvent.click(screen.getByText('apps.pos.status.retry'))
    expect(convertPosPayment).toHaveBeenCalledWith('sale-1', expect.anything())
  })
})
