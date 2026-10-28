import { useContext, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServiceWorkerWallet } from '@arkade-os/sdk'
import '../../../lib/i18n'
import * as bridge from '../../../lib/arkadeWrap'
import { ASSETS, getWrappedAssetId, type AssetSymbol } from '../../../lib/assets'
import { requireAssetChainOption, type SourceChainId } from '../../../lib/sourceChains'
import { FlowContext, type UnwrapSendInfo } from '../../../providers/flow'
import { NavigationContext } from '../../../providers/navigation'
import { TxResultContext } from '../../../providers/txResult'
import { WalletContext } from '../../../providers/wallet'
import UnwrapSend from '../../../screens/Wallet/Send/UnwrapSend'

const destination = '0x1234567890123456789012345678901234567890'
const initialInfo: UnwrapSendInfo = {
  assetSymbol: 'USDT',
  chainId: 'ethereum',
  ticker: 'USDT',
  sender: 'ark1sender',
  receiver: '',
}
const send = vi.fn()
const goBack = vi.fn()
const notifyResult = vi.fn().mockResolvedValue(undefined)
let quote: bridge.WrapQuote

function Harness({
  info = initialInfo,
  balance = BigInt(100_000_000),
  decimals,
  screenKey = 'initial',
}: {
  info?: UnwrapSendInfo
  balance?: bigint
  decimals?: number
  screenKey?: string
}) {
  const flowDefaults = useContext(FlowContext)
  const walletDefaults = useContext(WalletContext)
  const navigationDefaults = useContext(NavigationContext)
  const [unwrapSendInfo, setUnwrapSendInfo] = useState<UnwrapSendInfo | undefined>(info)
  const assetId = getWrappedAssetId(info.assetSymbol)!
  return (
    <NavigationContext.Provider value={{ ...navigationDefaults, goBack }}>
      <FlowContext.Provider value={{ ...flowDefaults, unwrapSendInfo, setUnwrapSendInfo }}>
        <WalletContext.Provider
          value={{
            ...walletDefaults,
            svcWallet: { send } as unknown as ServiceWorkerWallet,
            assetBalances: [{ assetId, amount: balance }],
            assetMetadataCache: new Map([
              [
                assetId,
                {
                  assetId,
                  supply: balance,
                  cachedAt: 0,
                  metadata: { decimals: decimals ?? ASSETS[info.assetSymbol as AssetSymbol].precision },
                },
              ],
            ]),
          }}
        >
          <TxResultContext.Provider value={{ notifyResult }}>
            <UnwrapSend key={screenKey} />
          </TxResultContext.Provider>
        </WalletContext.Provider>
      </FlowContext.Provider>
    </NavigationContext.Provider>
  )
}

const enterDestination = (value = destination) => {
  fireEvent.change(screen.getByRole('textbox'), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

// The amount step reserves a quote up front to learn the bridge minimum.
const waitForQuote = () => screen.findByText(/^Minimum: /)

const enterAmount = (value: string) => {
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Amount' }), { target: { value } })
}

beforeEach(() => {
  vi.clearAllMocks()
  send.mockResolvedValue('funding-txid')
  quote = {
    id: 'quote-id',
    type: 'unwrap',
    chain: 'ethereum',
    ticker: 'USDT-CX',
    sender: initialInfo.sender,
    receiver: destination,
    treasury: 'ark1treasury',
    status: 'pending',
    amount: null,
    fee_amount: null,
    payout_amount: null,
    min_amount: '1',
    deposit_tx_hash: null,
    mint_tx_hash: null,
    burn_tx_hash: null,
    payout_tx_hash: null,
    expiry: Date.now() + 60_000,
  }
  vi.spyOn(bridge, 'createUnwrapQuote').mockImplementation(async () => quote)
  vi.spyOn(bridge, 'getWrapQuote').mockImplementation(async () => quote)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Send to chains', () => {
  it('validates the destination, then offers an amount and balance shortcuts without funding the quote', async () => {
    render(<Harness />)
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    enterDestination('invalid')
    expect(screen.getByText('Enter a valid Ethereum address')).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()

    enterDestination(` ${destination} `)
    await waitForQuote()
    expect(screen.getByText('100 USDT available')).toBeInTheDocument()
    expect(screen.getByText(destination)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm sending' })).toBeDisabled()

    enterAmount('101')
    expect(screen.getByRole('button', { name: 'Insufficient funds' })).toBeDisabled()
    enterAmount('0.0000001')
    expect(screen.getByRole('button', { name: 'Confirm sending' })).toBeDisabled()
    enterAmount('12.5')

    for (const percent of [25, 50, 75, 100]) {
      fireEvent.click(screen.getByRole('button', { name: `${percent}%` }))
      expect(screen.getByRole('spinbutton', { name: 'Amount' })).toHaveValue(percent)
    }
    expect(screen.getByRole('button', { name: 'Confirm sending' })).toBeEnabled()
    expect(bridge.createUnwrapQuote).toHaveBeenCalledExactlyOnceWith({
      chain: 'ethereum',
      ticker: 'USDT',
      sender: initialInfo.sender,
      receiver: destination,
    })
    expect(send).not.toHaveBeenCalled()

    fireEvent.click(screen.getByLabelText('Go back'))
    expect(screen.getByRole('textbox')).toHaveValue(destination)
    expect(goBack).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('spinbutton', { name: 'Amount' })).toHaveValue(100)
    expect(bridge.createUnwrapQuote).toHaveBeenCalledTimes(1)
  })

  it('shows the bridge minimum and blocks amounts below it', async () => {
    quote = { ...quote, min_amount: '20000000' }
    render(<Harness />)
    enterDestination()
    expect(await screen.findByText('Minimum: 20 USDT')).toBeInTheDocument()

    enterAmount('19.999999')
    expect(screen.getByRole('button', { name: 'Below minimum' })).toBeDisabled()
    enterAmount('20')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm sending' }))
    await screen.findByText('Deposit sent, waiting for confirmation…')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('rechecks the minimum on the refreshed quote before funding', async () => {
    render(<Harness />)
    enterDestination()
    await waitForQuote()
    enterAmount('10')
    quote = { ...quote, min_amount: '20000000' }
    fireEvent.click(screen.getByRole('button', { name: 'Confirm sending' }))
    await screen.findByText('The minimum unwrap amount is 20 USDT')
    expect(send).not.toHaveBeenCalled()
  })

  it('rounds the displayed minimum up to the displayed precision', async () => {
    quote = { ...quote, min_amount: '1000000000000001' }
    render(<Harness info={{ ...initialInfo, assetSymbol: 'ETH', ticker: 'ETH' }} />)
    enterDestination()
    expect(await screen.findByText('Minimum: 0.00100001 ETH')).toBeInTheDocument()
  })

  it.each<[AssetSymbol, SourceChainId, string, bigint]>([
    ['USDT', 'ethereum', '12.345678', BigInt('12345678')],
    ['ETH', 'ethereum', '1.123456789012345678', BigInt('1123456789012345678')],
    ['POL', 'polygon', '0.000000000000000001', BigInt(1)],
    ['TRX', 'tron', '12.345678', BigInt('12345678')],
  ])('sends the exact %s amount from the wallet to the bridge treasury', async (symbol, chainId, value, amount) => {
    const option = requireAssetChainOption(symbol, chainId)
    const receiver = chainId === 'tron' ? `T${'1'.repeat(33)}` : destination
    render(
      <Harness
        info={{ ...initialInfo, assetSymbol: symbol, chainId, ticker: option.ticker }}
        balance={amount * BigInt(2)}
      />,
    )
    enterDestination(receiver)
    await waitForQuote()
    enterAmount(value)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm sending' }))

    await screen.findByText('Deposit sent, waiting for confirmation…')
    expect(bridge.createUnwrapQuote).toHaveBeenCalledWith({
      chain: chainId,
      ticker: option.ticker,
      sender: initialInfo.sender,
      receiver,
    })
    expect(send).toHaveBeenCalledExactlyOnceWith({
      address: quote.treasury,
      amount: 0,
      assets: [{ assetId: getWrappedAssetId(symbol), amount }],
    })
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.queryByText(quote.treasury)).not.toBeInTheDocument()
    expect(notifyResult).not.toHaveBeenCalledWith(true, expect.anything())
  })

  it('uses the wrapped asset metadata precision for amount entry', async () => {
    render(<Harness info={{ ...initialInfo, assetSymbol: 'ETH', ticker: 'ETH' }} decimals={8} />)
    enterDestination()
    await waitForQuote()
    enterAmount('0.12345678')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm sending' }))
    await screen.findByText('Deposit sent, waiting for confirmation…')
    expect(send).toHaveBeenCalledWith({
      address: quote.treasury,
      amount: 0,
      assets: [{ assetId: getWrappedAssetId('ETH'), amount: BigInt(12345678) }],
    })
  })

  it('blocks repeat submissions during funding and after returning to the screen', async () => {
    let finishSend!: (txid: string) => void
    send.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finishSend = resolve
        }),
    )
    const view = render(<Harness />)
    enterDestination()
    await waitForQuote()
    enterAmount('20')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm sending' }))
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('spinbutton')).toBeDisabled()
    expect(screen.getByRole('button', { name: '100%' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Sending assets' }))
    expect(send).toHaveBeenCalledTimes(1)

    view.rerender(<Harness screenKey='funding' />)
    expect(screen.getByRole('button', { name: 'Sending assets' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Sending assets' }))
    expect(send).toHaveBeenCalledTimes(1)

    await act(async () => finishSend('funding-txid'))
    view.rerender(<Harness screenKey='returned' />)
    expect(screen.getByText('Deposit sent, waiting for confirmation…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm sending' })).not.toBeInTheDocument()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('preserves the amount on errors and checks a previous quote before retrying funding', async () => {
    vi.mocked(bridge.createUnwrapQuote).mockRejectedValueOnce(new Error('Bridge unavailable'))
    render(<Harness />)
    enterDestination()
    await screen.findByText('Bridge unavailable')
    enterAmount('20')
    expect(send).not.toHaveBeenCalled()

    send.mockRejectedValueOnce(new Error('Wallet send failed'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm sending' }))
    await screen.findByText('Wallet send failed')
    expect(bridge.createUnwrapQuote).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('spinbutton')).toHaveValue(20)

    quote = { ...quote, status: 'deposited', deposit_tx_hash: 'previous-funding-txid' }
    fireEvent.click(screen.getByRole('button', { name: 'Confirm sending' }))
    await screen.findByText('Deposit detected, confirming…')
    expect(bridge.getWrapQuote).toHaveBeenCalledWith(quote.id)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('replaces an expired, unfunded quote on the amount step and again before sending', async () => {
    const expired = { ...quote, id: 'expired-quote', status: 'expired' as const, expiry: Date.now() - 1 }
    render(<Harness info={{ ...initialInfo, receiver: destination, amount: BigInt(20_000_000), quote: expired }} />)
    await waitForQuote()
    expect(bridge.createUnwrapQuote).toHaveBeenCalledTimes(1)

    vi.mocked(bridge.getWrapQuote).mockResolvedValueOnce(expired)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm sending' }))
    await screen.findByText('Deposit sent, waiting for confirmation…')
    expect(bridge.createUnwrapQuote).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenCalledExactlyOnceWith({
      address: quote.treasury,
      amount: 0,
      assets: [{ assetId: getWrappedAssetId('USDT'), amount: BigInt(20_000_000) }],
    })
  })

  it('tracks the payout after funding and only reports success when it completes', async () => {
    vi.useFakeTimers()
    const view = render(
      <Harness
        info={{ ...initialInfo, receiver: destination, amount: BigInt(20_000_000), quote, txid: 'funding-txid' }}
      />,
    )
    await act(() => vi.advanceTimersByTimeAsync(8000))
    view.rerender(<Harness screenKey='after-poll' />)
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.getByText('20 USDT')).toBeInTheDocument()
    expect(notifyResult).not.toHaveBeenCalled()

    quote = { ...quote, status: 'completed', payout_amount: '19000000' }
    await act(() => vi.advanceTimersByTimeAsync(8000))
    expect(screen.getByText('19 USDT sent on Ethereum')).toBeInTheDocument()
    expect(notifyResult).toHaveBeenCalledExactlyOnceWith(true, 'Payout sent')
    await act(() => vi.advanceTimersByTimeAsync(16000))
    expect(bridge.getWrapQuote).toHaveBeenCalledTimes(2)
    expect(send).not.toHaveBeenCalled()
  })
})
