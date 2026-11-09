import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import '../../../lib/i18n'
import Transaction from '../../../screens/Wallet/Transaction'
import { FlowContext } from '../../../providers/flow'
import {
  mockAspContextValue,
  mockFlowContextValue,
  mockIssuanceTxInfo,
  mockNavigationContextValue,
  mockTxId,
  mockTxInfo,
  mockWalletContextValue,
} from '../mocks'
import { AspContext } from '../../../providers/asp'
import { WalletContext } from '../../../providers/wallet'
import { NavigationContext } from '../../../providers/navigation'
import { getTxNote, setTxNote } from '../../../lib/txNotes'
import { AssetSwapsContext } from '../../../providers/assetSwaps'

// These pin Chimera-specific behaviour that an upstream Arkade merge has
// silently reverted before: Confirmed / Pending / Failed statuses, amounts in
// BTC, and no manual settle / "Complete Boarding" buttons (deposits board
// automatically on app start and refresh).

type TxInfo = typeof mockFlowContextValue.txInfo

const renderTx = (txInfo: TxInfo, txs: TxInfo[] = [txInfo], walletOverrides: object = {}) =>
  render(
    <NavigationContext.Provider value={mockNavigationContextValue}>
      <AspContext.Provider value={mockAspContextValue}>
        <FlowContext.Provider value={{ ...mockFlowContextValue, txInfo }}>
          <WalletContext.Provider value={{ ...mockWalletContextValue, txs, ...walletOverrides } as any}>
            <Transaction />
          </WalletContext.Provider>
        </FlowContext.Provider>
      </AspContext.Provider>
    </NavigationContext.Provider>,
  )

const expectNoManualSettleButtons = () => {
  expect(screen.queryByText('Complete Boarding')).not.toBeInTheDocument()
  expect(screen.queryByText('Settle transaction')).not.toBeInTheDocument()
  expect(screen.queryByText('Add reminder')).not.toBeInTheDocument()
  expect(screen.queryByText('Resend')).not.toBeInTheDocument()
}

const pendingBoardingTx = { ...mockTxInfo, boardingTxid: mockTxId, settled: false, preconfirmed: true }

describe('Transaction screen', () => {
  it('shows a settled transaction as Confirmed with amounts in BTC', () => {
    renderTx(mockTxInfo)
    expect(screen.getByText('Network fees')).toBeInTheDocument()
    expect(screen.getByText('Amount')).toBeInTheDocument()
    expect(screen.getByText('Received')).toBeInTheDocument()
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
    // amount and total
    expect(screen.getAllByText('0.001 BTC')).toHaveLength(2)
    expect(screen.queryByText(/SATS/)).not.toBeInTheDocument()
    expectNoManualSettleButtons()
  })

  it('shows an unconfirmed deposit as Pending, waiting for on-chain confirmation', () => {
    renderTx({ ...pendingBoardingTx, createdAt: 0 })
    // status row + banner title
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0)
    expect(screen.getByText(/Please wait for confirmation/)).toBeInTheDocument()
    expectNoManualSettleButtons()
  })

  it('shows a confirmed deposit as Pending and says it boards automatically, with no button', () => {
    renderTx(pendingBoardingTx)
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0)
    expect(screen.getByText(/being added to your wallet automatically/)).toBeInTheDocument()
    expect(screen.queryByText('Pending Boarding')).not.toBeInTheDocument()
    expectNoManualSettleButtons()
  })

  it('shows an expired deposit as Failed', () => {
    renderTx({ ...pendingBoardingTx, createdAt: Math.floor(Date.now() / 1000) - 10_000 })
    expect(screen.getAllByText('Failed').length).toBeGreaterThan(0)
    expect(screen.getByText('Boarding transaction expired.')).toBeInTheDocument()
    expectNoManualSettleButtons()
  })

  it('shows a preconfirmed Arkade transaction as Confirmed, not Preconfirmed', () => {
    renderTx({ ...mockTxInfo, boardingTxid: '', redeemTxid: mockTxId, settled: false, preconfirmed: true })
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
    expect(screen.queryByText('Preconfirmed')).not.toBeInTheDocument()
    expectNoManualSettleButtons()
  })

  it('follows the live wallet entry, so the status updates once a deposit boards', () => {
    renderTx(pendingBoardingTx, [{ ...pendingBoardingTx, settled: true, preconfirmed: false }])
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
    expect(screen.queryByText(/being added to your wallet automatically/)).not.toBeInTheDocument()
  })

  it('renders issuance transaction with correct direction', () => {
    renderTx(mockIssuanceTxInfo as TxInfo)
    expect(screen.getByText('Issuance')).toBeInTheDocument()
    expect(screen.queryByText('Sent')).not.toBeInTheDocument()
  })

  it('applies 18-decimal metadata to wrapped asset amounts', () => {
    const assetId = mockIssuanceTxInfo.assets[0].assetId
    const txInfo = {
      ...mockIssuanceTxInfo,
      type: 'received',
      assets: [{ assetId, amount: BigInt(9_970_000_000) }],
    } as TxInfo
    const assetMetadataCache = new Map([
      [assetId, { metadata: { ticker: 'ETH-CX', name: 'Ethereum', decimals: 18 }, cachedAt: Date.now() }],
    ])

    renderTx(txInfo, [txInfo], { assetMetadataCache })

    expect(screen.getByText('0.00000000997 ETH-CX')).toBeInTheDocument()
    expect(screen.queryByText('9,970,000,000 ETH-CX')).not.toBeInTheDocument()
  })

  it('renders burn transaction with correct direction', () => {
    const mockBurnTxInfo = {
      ...mockIssuanceTxInfo,
      assets: [
        { assetId: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd', amount: BigInt(-5_000) },
      ],
    }
    renderTx(mockBurnTxInfo as TxInfo)
    expect(screen.getByText('Burn')).toBeInTheDocument()
    expect(screen.queryByText('Sent')).not.toBeInTheDocument()
  })
})

describe('Transaction note', () => {
  afterEach(() => localStorage.clear())

  it('adds a note to a past transaction', () => {
    renderTx(mockTxInfo)

    fireEvent.click(screen.getByText('Add note'))
    fireEvent.change(screen.getByTestId('tx-note-input'), { target: { value: 'Invoice 42' } })
    fireEvent.click(screen.getByText('Save note'))

    expect(getTxNote(`received:${mockTxId}`)).toBe('Invoice 42')
    expect(screen.getByTestId('tx-note')).toHaveTextContent('Invoice 42')
  })

  it('shows and removes a saved note', () => {
    setTxNote(`received:${mockTxId}`, 'Rent')
    renderTx(mockTxInfo)

    expect(screen.getByTestId('tx-note')).toHaveTextContent('Rent')
    fireEvent.click(screen.getByTestId('tx-note'))
    fireEvent.click(screen.getByText('Remove note'))

    expect(getTxNote(`received:${mockTxId}`)).toBe('')
    expect(screen.getByTestId('tx-note')).toHaveTextContent('Add note')
  })

  it('keeps notes per transaction direction', () => {
    setTxNote(`received:${mockTxId}`, 'Rent')
    renderTx({ ...mockTxInfo, type: 'sent' })
    expect(screen.getByTestId('tx-note')).toHaveTextContent('Add note')
  })
})

describe('Transaction screen: asset swaps', () => {
  const swapTx = (status: 'pending' | 'completed') => ({
    ...mockTxInfo,
    type: 'swap',
    redeemTxid: mockTxId,
    assetSwap: {
      id: mockTxId,
      fromAssetId: 'btc',
      fromTicker: 'BTC',
      fromDecimals: 8,
      fromAmount: BigInt(10_000),
      toAssetId: 'aa'.repeat(34),
      toTicker: 'USDT',
      toDecimals: 6,
      toAmount: BigInt(1_000_000),
      status,
    },
  })

  const renderSwap = (recordStatus: string, cancelSwap = vi.fn().mockResolvedValue(undefined)) => {
    const txInfo = swapTx(recordStatus === 'fulfilled' ? 'completed' : 'pending') as unknown as TxInfo
    render(
      <NavigationContext.Provider value={mockNavigationContextValue}>
        <AspContext.Provider value={mockAspContextValue}>
          <FlowContext.Provider value={{ ...mockFlowContextValue, txInfo }}>
            <WalletContext.Provider value={{ ...mockWalletContextValue, txs: [txInfo] } as any}>
              <AssetSwapsContext.Provider value={{ swaps: [{ id: mockTxId, status: recordStatus }], cancelSwap } as any}>
                <Transaction />
              </AssetSwapsContext.Provider>
            </WalletContext.Provider>
          </FlowContext.Provider>
        </AspContext.Provider>
      </NavigationContext.Provider>,
    )
    return cancelSwap
  }

  it('offers to cancel a swap still waiting for a fill, and cancels that swap', () => {
    const cancelSwap = renderSwap('pending')
    expect(screen.getByText('Waiting for a solver')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('cancel-swap'))
    expect(cancelSwap).toHaveBeenCalledWith(mockTxId)
  })

  it.each(['fulfilled', 'cancelling', 'cancelled', 'recoverable'])('offers no cancel for a %s swap', (status) => {
    renderSwap(status)
    expect(screen.queryByTestId('cancel-swap')).not.toBeInTheDocument()
  })
})
