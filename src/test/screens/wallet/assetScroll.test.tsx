import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import '../../../lib/i18n'
import Wallet from '../../../screens/Wallet/Index'
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

const scrollArea = (container: HTMLElement) => container.querySelector('.content') as HTMLElement

describe('Wallet asset page', () => {
  it('opens at the top, not at the home page’s scroll position', async () => {
    vi.spyOn(CoinGeckoConversionService, 'getBulkConversionRates').mockResolvedValue({})
    vi.spyOn(CoinGeckoConversionService, 'getHistoricalPrices').mockResolvedValue({ prices: [] })
    const { container } = render(<Wallet />)
    const bitcoin = await screen.findByText('Bitcoin')
    scrollArea(container).scrollTop = 500

    fireEvent.click(bitcoin)

    expect(screen.getByText('Send')).toBeInTheDocument()
    expect(scrollArea(container).scrollTop).toBe(0)
  })
})
