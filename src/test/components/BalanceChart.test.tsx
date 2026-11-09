import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BalanceChart from '../../components/BalanceChart'
import { CoinGeckoConversionService } from '../../lib/coingecko/service'
import { ConfigContext } from '../../providers/config'
import { WalletContext } from '../../providers/wallet'
import { mockConfigContextValue, mockWalletContextValue } from '../screens/mocks'

const renderChart = () =>
  render(
    <ConfigContext.Provider value={mockConfigContextValue as any}>
      <WalletContext.Provider value={{ ...mockWalletContextValue, balance: 100_000, txs: [] } as any}>
        <BalanceChart />
      </WalletContext.Provider>
    </ConfigContext.Provider>,
  )

describe('BalanceChart', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('draws the chart with its timeframes once prices load', async () => {
    vi.spyOn(CoinGeckoConversionService, 'getHistoricalPrices').mockResolvedValue({
      prices: [
        [1, 10_000],
        [2, 20_000],
      ],
    })
    renderChart()
    await waitFor(() => expect(screen.queryByText('Loading chart...')).not.toBeInTheDocument())
    expect(screen.getByText('1Y')).toBeInTheDocument()
  })

  it('defaults to 1M, shown in full colour while the other timeframes are greyed', async () => {
    vi.spyOn(CoinGeckoConversionService, 'getHistoricalPrices').mockResolvedValue({ prices: [] })
    renderChart()
    const selected = await screen.findByRole('button', { pressed: true })
    expect(selected).toHaveTextContent('1M')
    expect(selected).toHaveStyle({ color: 'var(--fg)' })
    for (const tf of ['1D', '1W', '1Y', 'MAX'])
      expect(screen.getByText(tf)).toHaveStyle({ color: 'var(--neutral-500)' })
  })

  it('hides itself, with no error, when prices cannot be fetched', async () => {
    vi.spyOn(CoinGeckoConversionService, 'getHistoricalPrices').mockRejectedValue(new Error('offline'))
    const { container } = renderChart()
    await waitFor(() => expect(container).toBeEmptyDOMElement())
    expect(screen.queryByText('Failed to load price data')).not.toBeInTheDocument()
  })
})
