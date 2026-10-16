import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Enable USDT (its test id is 'test-usdt', see vitest.config.ts) before the
// asset list is built from the env at import.
vi.hoisted(() => vi.stubEnv('VITE_ENABLED_ASSETS', 'BTC,USDT'))

import '../../../lib/i18n'
import Wallet from '../../../screens/Wallet/Index'
import TransactionsList from '../../../components/TransactionsList'
import { AssetPricesContext } from '../../../providers/assetPrices'
import { ConfigContext } from '../../../providers/config'
import { FiatContext } from '../../../providers/fiat'
import { WalletContext } from '../../../providers/wallet'
import { mockConfigContextValue, mockFiatContextValue, mockWalletContextValue } from '../mocks'
import { CoinGeckoConversionService } from '../../../lib/coingecko/service'

// The home banner carousel needs observers jsdom lacks.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
vi.stubGlobal('IntersectionObserver', NoopObserver)
vi.stubGlobal('ResizeObserver', NoopObserver)

const USDT_ID = 'test-usdt'
const BTC_EUR = 50_000
const USDT_EUR = 0.9

const usdtReceive = {
  amount: 330,
  assets: [{ assetId: USDT_ID, amount: BigInt(20_000_000) }], // 20 USDT (6 decimals)
  boardingTxid: '',
  redeemTxid: 'abc',
  roundTxid: '',
  createdAt: Math.floor(Date.now() / 1000) - 60,
  explorable: undefined,
  preconfirmed: false,
  settled: true,
  type: 'received',
}

const renderWithPrices = (ui: JSX.Element) =>
  render(
    <ConfigContext.Provider value={mockConfigContextValue as any}>
      <FiatContext.Provider value={{ ...mockFiatContextValue, toFiat: (sats = 0) => (sats / 1e8) * BTC_EUR } as any}>
        <AssetPricesContext.Provider
          value={{ getPriceData: (symbol) => ({ rate: symbol === 'USDT' ? USDT_EUR : 0 }), loading: false }}
        >
          <WalletContext.Provider
            value={
              {
                ...mockWalletContextValue,
                balance: 100_000, // 0.001 BTC = €50
                assetBalances: [{ assetId: USDT_ID, amount: BigInt(20_000_000) }], // 20 USDT = €18
                assetMetadataCache: new Map([[USDT_ID, { metadata: { ticker: 'USDT-CX', decimals: 6 }, cachedAt: 0 }]]),
                txs: [usdtReceive],
                dataReady: true,
              } as any
            }
          >
            {ui}
          </WalletContext.Provider>
        </AssetPricesContext.Provider>
      </FiatContext.Provider>
    </ConfigContext.Provider>,
  )

describe('wallet fiat values across assets', () => {
  it('totals every asset in the headline balance, not just BTC', () => {
    // the balance chart fetches price history; keep it off the network
    vi.spyOn(CoinGeckoConversionService, 'getHistoricalPrices').mockResolvedValue({ prices: [] })
    renderWithPrices(<Wallet />)
    expect(screen.getByText('€68.00')).toBeInTheDocument()
  })

  it('shows the fiat value under a wrapped asset transaction', () => {
    renderWithPrices(<TransactionsList />)
    expect(screen.getByText('+ €18.00')).toBeInTheDocument()
  })
})
