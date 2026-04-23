# CoinGecko API Integration

This implementation provides a complete CoinGecko API integration for fetching current and historical cryptocurrency prices.

## Features

✅ Current price fetching for multiple assets  
✅ Historical price data (30 days, 90 days, 1 year, etc.)  
✅ 24h price change tracking  
✅ Multi-currency support (CHF, EUR, USD)  
✅ Special handling for fiat currencies  
✅ Custom rate overrides  
✅ Validation and error handling  
✅ Bulk operations for efficiency  
✅ Market data and coin search

## Architecture

This implementation follows **centralized configuration** with a single source of truth for all assets:

**Crypto Assets**: [src/lib/assets.ts](../assets.ts)

- Defines: BTC, USDT, ETH, TRX, MATIC
- Contains: symbol, name, color (CSS var), precision
- Type: `AssetSymbol` derived from object keys

**Fiat Currencies**: [src/lib/fiatConfig.ts](../fiatConfig.ts)

- Defines: CHF, EUR, USD
- Contains: symbol, name, precision, exchange rates
- Type: `FiatSymbol` derived from object keys

**CoinGecko Mapping**: [mapping.ts](mapping.ts)

- Imports from assets.ts and fiatConfig.ts
- Adds only CoinGecko-specific info (API IDs)
- Dynamically builds mappings from centralized configs

Each asset/fiat is **defined once** and referenced everywhere else.

## File Structure

```
src/lib/coingecko/
├── api.ts         # Core API client for CoinGecko endpoints
├── cache.ts       # Caching and rate limiting
├── mapping.ts     # Asset symbol to CoinGecko ID mappings
├── service.ts     # High-level conversion service
└── index.ts       # Public exports
```

## Caching & Rate Limiting

The API includes built-in caching and rate limiting to prevent hitting CoinGecko's API limits:

**Cache Expiration Times:**

- Current prices: 1 minute
- Historical 1D: 5 minutes
- Historical 1W: 15 minutes
- Historical 1M: 30 minutes
- Historical 1Y: 1 hour
- Historical MAX: 2 hours

**Rate Limiting:**

- Minimum 1.5 seconds between API requests
- Maximum 30 requests per minute
- Automatic request queuing when limits are reached

```typescript
import { coingeckoCache } from '../lib/coingecko'

// Clear all cached data
coingeckoCache.clearAll()

// Get cache statistics
const stats = coingeckoCache.getStats()
console.log(stats) // { priceEntries: 5, historicalEntries: 3, requestCount: 12 }
```

## Usage Examples

### Get Current Bitcoin Price

```typescript
import { CoinGeckoConversionService } from '../lib/coingecko/service'

// Single asset, single currency
const btcPrice = await CoinGeckoConversionService.getSingleConversionRate('BTC', 'chf')
console.log(`BTC price: ${btcPrice} CHF`)
```

### Get Multiple Asset Prices

```typescript
import { CoinGeckoConversionService } from '../lib/coingecko/service'

// Multiple assets, multiple currencies
const rates = await CoinGeckoConversionService.getBulkConversionRates(['BTC', 'ETH', 'USDT'], {
  vsCurrencies: ['chf', 'eur', 'usd'],
  include24hChange: true,
})

console.log('BTC:', rates.BTC)
// Output: { chf: 85000, eur: 78000, usd: 92000, chf_24h_change: 2.5, ... }
```

### Convert Amount

```typescript
import { CoinGeckoConversionService } from '../lib/coingecko/service'

// Convert 0.5 BTC to CHF
const chfAmount = await CoinGeckoConversionService.convertAmount(0.5, 'BTC', 'chf')
console.log(`0.5 BTC = ${chfAmount} CHF`)
```

### Get Historical Prices

```typescript
import { CoinGeckoConversionService } from '../lib/coingecko/service'

// Get last 30 days of BTC prices
const history = await CoinGeckoConversionService.getHistoricalPrices('BTC', 'usd', 30)

// history.prices is an array of [timestamp, price] tuples
history.prices.forEach(([timestamp, price]) => {
  const date = new Date(timestamp)
  console.log(`${date.toLocaleDateString()}: $${price}`)
})
```

### Using Direct API Access

```typescript
import CoinGeckoApi from '../lib/coingecko/api'

// Get market data with cap and volume
const marketData = await CoinGeckoApi.getMarketData(['bitcoin', 'ethereum'], 'usd')
console.log(marketData)
// [{ id: 'bitcoin', symbol: 'btc', current_price: 92000, market_cap: ..., ... }]

// Search for coins
const results = await CoinGeckoApi.searchCoins('cardano')
console.log(results)
// [{ id: 'cardano', symbol: 'ada', name: 'Cardano' }]
```

## In React Components

### Fetch Prices in useEffect

```typescript
import { useEffect, useState } from 'react'
import { CoinGeckoConversionService } from '../../lib/coingecko/service'

export default function PriceDisplay() {
  const [btcPrice, setBtcPrice] = useState<number | null>(null)

  useEffect(() => {
    const fetchPrice = async () => {
      const price = await CoinGeckoConversionService.getSingleConversionRate('BTC', 'chf')
      setBtcPrice(price)
    }

    fetchPrice()

    // Refresh every 60 seconds
    const interval = setInterval(fetchPrice, 60000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div>
      {btcPrice ? `${btcPrice.toFixed(2)} CHF` : 'Loading...'}
    </div>
  )
}
```

### Portfolio Value Calculator

```typescript
import { CoinGeckoConversionService } from '../../lib/coingecko/service'

interface Asset {
  symbol: string
  amount: number
}

async function calculatePortfolioValue(assets: Asset[]): Promise<number> {
  const symbols = assets.map((a) => a.symbol)
  const rates = await CoinGeckoConversionService.getBulkConversionRates(symbols, {
    vsCurrencies: ['chf'],
  })

  let totalValue = 0
  for (const asset of assets) {
    const rate = rates[asset.symbol]?.chf || 0
    totalValue += asset.amount * rate
  }

  return totalValue
}

// Usage
const portfolio = [
  { symbol: 'BTC', amount: 0.5 },
  { symbol: 'ETH', amount: 2.0 },
  { symbol: 'USDT', amount: 1000 },
]

const totalCHF = await calculatePortfolioValue(portfolio)
console.log(`Portfolio value: ${totalCHF.toFixed(2)} CHF`)
```

## Adding New Assets

To add support for a new cryptocurrency:

1. Open [src/lib/assets.ts](src/lib/assets.ts) and add the asset to the `ASSETS` object:

```typescript
export const ASSETS = {
  // ... existing assets
  ADA: {
    symbol: 'ADA',
    name: 'Cardano',
    color: 'asset-ada',
    precision: 6,
  },
} as const
```

2. Add the color to [src/ionic.css](../../ionic.css):

```css
--asset-ada: #0033ad;
```

3. Open [src/lib/coingecko/mapping.ts](src/lib/coingecko/mapping.ts) and add the CoinGecko ID to the map:

```typescript
const CRYPTO_COINGECKO_ID_MAP: Record<AssetSymbol, CoinGeckoAssetID> = {
  // ... existing mappings
  ADA: 'cardano',
}
```

4. (Optional) Add an icon path in [src/icons/AssetIcon.tsx](../../icons/AssetIcon.tsx):

```typescript
const ADAPath = () => (
  <path fill="white" d="M12 2L..." />
)

const iconPaths: Record<string, () => JSX.Element> = {
  // ... existing icons
  ADA: ADAPath,
}
```

To find the correct CoinGecko ID:

```typescript
import CoinGeckoApi from '../lib/coingecko/api'

const results = await CoinGeckoApi.searchCoins('cardano')
console.log(results[0].id) // 'cardano'
```

The asset configuration is now **centralized** in `src/lib/assets.ts` and referenced by the CoinGecko mapping.

## Supported Assets

Currently supported assets:

- **BTC** (Bitcoin)
- **USDT** (Tether)
- **ETH** (Ethereum)
- **TRX** (TRON)
- **MATIC** (Polygon)
- **CHF** (Swiss Franc) - special handling
- **EUR** (Euro) - special handling
- **USD** (US Dollar) - special handling

## API Rate Limits

CoinGecko free tier limits:

- 10-50 calls/minute
- **Built-in caching** automatically prevents excessive API calls
- **Rate limiting** queues requests to stay within limits
- Switching timeframes uses cached data when available

## Error Handling

All methods include proper error handling:

```typescript
try {
  const rates = await CoinGeckoConversionService.getBulkConversionRates(['BTC'])
  console.log(rates)
} catch (error) {
  console.error('Failed to fetch rates:', error)
  // Fallback behavior
}
```

On errors, the service returns zero prices rather than throwing, allowing graceful degradation.

## Integration with Fiat Provider

The fiat provider ([src/lib/fiat.ts](src/lib/fiat.ts)) has been updated to use CoinGecko as the primary price source with blockchain.info as fallback:

```typescript
import { getPriceFeed } from '../lib/fiat'

const prices = await getPriceFeed()
console.log(prices) // { eur: 78000, usd: 92000, chf: 85000 }
```

## Custom Rates

You can provide custom rates for testing or offline scenarios:

```typescript
const rates = await CoinGeckoConversionService.getBulkConversionRates(['BTC', 'CUSTOM_TOKEN'], {
  customRates: {
    CUSTOM_TOKEN: { chf: 1.5, eur: 1.4, usd: 1.6 },
  },
})
```

## Validation

Validate symbols before making requests:

```typescript
const { valid, invalid } = CoinGeckoConversionService.validateSymbols(['BTC', 'ETH', 'UNKNOWN'])

console.log('Valid:', valid) // ['BTC', 'ETH']
console.log('Invalid:', invalid) // ['UNKNOWN']
```
