import { useContext } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServiceWorkerWallet } from '@arkade-os/sdk'
import '../../../lib/i18n'
import * as bridge from '../../../lib/arkadeWrap'
import * as asp from '../../../lib/asp'
import { getWrappedAssetId } from '../../../lib/assets'
import { getWirexWallet, type WirexCard } from '../../../lib/wirex'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { WalletContext } from '../../../providers/wallet'
import WirexTopUp from '../../../screens/Apps/WirexCard/TopUp'
import WirexCardHome from '../../../screens/Apps/WirexCard/CardHome'
import { readPendingTopUps, savePendingTopUp } from '../../../screens/Apps/WirexCard/topUp'

vi.mock('../../../lib/wirex', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/wirex')>()),
  getWirexWallet: vi.fn(),
}))

const kernel = '0x1111111111111111111111111111111111111111'
const assetId = getWrappedAssetId('USDT')!
const send = vi.fn()
const goBack = vi.fn()
const navigate = vi.fn()
let quote: bridge.WrapQuote

const wirexWallet = (wusd: number) => ({
  wallet_address: kernel,
  balances: [{ token_symbol: 'WUSD', token_address: '0xWusd', balance: wusd }],
})

function Harness({ balance = BigInt(50_000_000) }: { balance?: bigint }) {
  const walletDefaults = useContext(WalletContext)
  const navigationDefaults = useContext(NavigationContext)
  return (
    <NavigationContext.Provider
      value={{ ...navigationDefaults, goBack, navigate, navigationData: { userAddress: '0xUser', cardId: 'card-1' } }}
    >
      <WalletContext.Provider
        value={{
          ...walletDefaults,
          svcWallet: { send } as unknown as ServiceWorkerWallet,
          assetBalances: [{ assetId, amount: balance }],
        }}
      >
        <WirexTopUp />
      </WalletContext.Provider>
    </NavigationContext.Provider>
  )
}

const enterAmount = (value: string) =>
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Amount' }), { target: { value } })

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.stubEnv('VITE_WIREX_ENABLED', 'true')
  vi.stubEnv('VITE_WIREX_TOPUP_ENABLED', 'true')
  vi.stubEnv('VITE_WIREX_DEPOSIT_CHAIN', 'base')
  quote = {
    id: 'q1',
    type: 'unwrap',
    chain: 'base',
    ticker: 'USDT-CX',
    sender: 'ark1sender',
    receiver: kernel,
    treasury: 'ark1treasury',
    status: 'pending',
    amount: null,
    fee_amount: null,
    payout_amount: null,
    min_amount: '1000000',
    network_fee_amount: '100000',
    deposit_tx_hash: null,
    mint_tx_hash: null,
    burn_tx_hash: null,
    payout_tx_hash: null,
    expiry: Date.now() + 60_000,
  }
  vi.spyOn(asp, 'getReceivingAddresses').mockResolvedValue({ offchainAddr: 'ark1sender', boardingAddr: 'bc1q' })
  vi.spyOn(asp, 'sendAssets').mockResolvedValue('ark-txid')
  vi.spyOn(bridge, 'createUnwrapQuote').mockImplementation(async () => quote)
  vi.spyOn(bridge, 'getWrapQuote').mockImplementation(async () => quote)
  vi.mocked(getWirexWallet).mockResolvedValue(wirexWallet(10))
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('Wirex card top-up', () => {
  it('reserves a quote paying the Wirex smart wallet on Base and shows the minimum', async () => {
    render(<Harness />)
    await screen.findByText(/^Minimum: /)
    expect(bridge.createUnwrapQuote).toHaveBeenCalledWith({
      chain: 'base',
      ticker: 'USDT',
      sender: 'ark1sender',
      receiver: kernel,
    })
  })

  it('blocks amounts below the minimum or above the balance', async () => {
    render(<Harness balance={BigInt(5_000_000)} />)
    await screen.findByText(/^Minimum: /)
    const confirm = screen.getByTestId('wirex-topup-confirm')
    enterAmount('0.5')
    expect(confirm).toBeDisabled()
    enterAmount('6')
    expect(confirm).toBeDisabled()
    expect(screen.getByText('Insufficient balance')).toBeInTheDocument()
    enterAmount('2')
    expect(confirm).toBeEnabled()
  })

  it('funds the bridge, then follows it until the card balance is credited', async () => {
    render(<Harness />)
    await screen.findByText(/^Minimum: /)
    enterAmount('5')
    // Funding refreshes the pending quote; tracking then sees it paid out and
    // Wirex's WUSD credit on its first polls.
    vi.mocked(bridge.getWrapQuote)
      .mockResolvedValueOnce(quote)
      .mockResolvedValue({ ...quote, status: 'completed', payout_tx_hash: '0xpayout' })
    vi.mocked(getWirexWallet).mockResolvedValue(wirexWallet(14.9))
    fireEvent.click(screen.getByTestId('wirex-topup-confirm'))

    await screen.findByText('Card topped up!')
    expect(asp.sendAssets).toHaveBeenCalledWith(expect.anything(), 'ark1treasury', [
      { assetId, amount: BigInt(5_000_000) },
    ])
    expect(readPendingTopUps('0xUser')).toEqual([])
  })

  it('remembers an in-flight top-up so the card home can resume it', async () => {
    render(<Harness />)
    await screen.findByText(/^Minimum: /)
    enterAmount('5')
    fireEvent.click(screen.getByTestId('wirex-topup-confirm'))

    await waitFor(() => expect(screen.getByTestId('wirex-topup-status')).toHaveTextContent('Base'))
    expect(readPendingTopUps('0xUser')).toMatchObject([{ quoteId: 'q1', amount: '5000000', baselineWusd: 10 }])
  })
})

describe('Card home', () => {
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
  const renderHome = () =>
    render(
      <NavigationContext.Consumer>
        {(defaults) => (
          <NavigationContext.Provider value={{ ...defaults, navigate }}>
            <WirexCardHome user={user} card={card} />
          </NavigationContext.Provider>
        )}
      </NavigationContext.Consumer>,
    )

  it('opens the wallet top-up when enabled', async () => {
    renderHome()
    fireEvent.click(await screen.findByTestId('wirex-top-up'))
    expect(navigate).toHaveBeenCalledWith(Pages.AppWirexTopUp, { userAddress: '0xUser', cardId: 'card-1' })
  })

  it('falls back to moving Wirex wallet assets when top-up is disabled', async () => {
    vi.stubEnv('VITE_WIREX_TOPUP_ENABLED', 'false')
    renderHome()
    fireEvent.click(await screen.findByTestId('wirex-top-up'))
    expect(navigate).toHaveBeenCalledWith(Pages.AppWirexMoveAssets, expect.objectContaining({ direction: 'toCard' }))
  })

  it('shows and resumes a pending top-up', async () => {
    quote = { ...quote, status: 'processing' }
    savePendingTopUp({
      quoteId: 'q1',
      txid: 'ark-txid',
      userAddress: '0xUser',
      symbol: 'USDT',
      amount: '5000000',
      baselineWusd: 10,
      createdAt: 0,
      phase: 'bridging',
    })
    renderHome()
    expect(await screen.findByText(/Top-up of 5 USDT in progress/)).toBeInTheDocument()
    await waitFor(() => expect(bridge.getWrapQuote).toHaveBeenCalledWith('q1'))
  })
})
