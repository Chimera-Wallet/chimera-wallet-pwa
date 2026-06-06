import { consoleError } from './logs'
import { CoinGeckoConversionService } from './coingecko/service'
import { ASSETS } from './assets'
import { FIATS } from './fiatConfig'
import { Fiats } from './types'

export interface FiatPrices {
  eur: number
  usd: number
  chf: number
  jpy: number
  gbp: number
  cny: number
}

// Currencies listed here are prefixed with their symbol when displaying amounts.
// Those omitted (CHF, CNY) keep the trailing ISO code — CNY skips ¥ to avoid
// clashing with JPY.
export const FIAT_SYMBOLS: Partial<Record<Fiats, string>> = {
  [Fiats.USD]: '$',
  [Fiats.EUR]: '€',
  [Fiats.GBP]: '£',
  [Fiats.JPY]: '¥',
}

export const fiatDecimalsFor = (currency: Fiats): number => (currency === Fiats.JPY ? 0 : 2)

export const getPriceFeed = async (): Promise<FiatPrices | undefined> => {
  try {
    // Try CoinGecko first
    const vsCurrencies = [
      FIATS.EUR.symbol.toLowerCase(),
      FIATS.USD.symbol.toLowerCase(),
      FIATS.CHF.symbol.toLowerCase(),
      FIATS.JPY.symbol.toLowerCase(),
      FIATS.GBP.symbol.toLowerCase(),
      FIATS.CNY.symbol.toLowerCase(),
    ]
    const rates = await CoinGeckoConversionService.getBulkConversionRates([ASSETS.BTC.symbol], {
      vsCurrencies,
      include24hChange: false,
    })

    const btcRates = rates[ASSETS.BTC.symbol]
    if (btcRates && btcRates.eur && btcRates.usd && btcRates.chf) {
      return {
        eur: btcRates.eur,
        usd: btcRates.usd,
        chf: btcRates.chf,
        jpy: btcRates.jpy ?? 0,
        gbp: btcRates.gbp ?? 0,
        cny: btcRates.cny ?? 0,
      }
    }

    // Fallback to blockchain.info
    const resp = await fetch('https://blockchain.info/ticker')
    const json = await resp.json()
    return {
      eur: json.EUR?.last,
      usd: json.USD?.last,
      chf: json.CHF?.last,
      jpy: json.JPY?.last,
      gbp: json.GBP?.last,
      cny: json.CNY?.last,
    }
  } catch (err) {
    consoleError(err, 'error fetching fiat prices')
  }
}
