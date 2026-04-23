import { consoleError } from './logs'
import { CoinGeckoConversionService } from './coingecko/service'
import { ASSETS } from './assets'
import { FIATS } from './fiatConfig'

export interface FiatPrices {
  eur: number
  usd: number
  chf: number
}

export const getPriceFeed = async (): Promise<FiatPrices | undefined> => {
  try {
    // Try CoinGecko first
    const vsCurrencies = [
      FIATS.EUR.symbol.toLowerCase(),
      FIATS.USD.symbol.toLowerCase(),
      FIATS.CHF.symbol.toLowerCase(),
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
      }
    }

    // Fallback to blockchain.info
    const resp = await fetch('https://blockchain.info/ticker')
    const json = await resp.json()
    return {
      eur: json.EUR?.last,
      usd: json.USD?.last,
      chf: json.CHF?.last,
    }
  } catch (err) {
    consoleError(err, 'error fetching fiat prices')
  }
}
