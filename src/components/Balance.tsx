import { useContext } from 'react'
import { fromSatoshis, prettyHide, prettyNumber } from '../lib/format'
import { FIAT_SYMBOLS } from '../lib/fiat'
import { CurrencyDisplay } from '../lib/types'
import { FiatContext } from '../providers/fiat'
import Text from './Text'
import FlexCol from './FlexCol'
import FlexRow from './FlexRow'
import EyeIcon from '../icons/Eye'
import { ConfigContext } from '../providers/config'
import { ASSETS } from '../lib/assets'

interface BalanceProps {
  amount: number
  centered?: boolean
  usdOnly?: boolean
}

export default function Balance({ amount, centered = false, usdOnly = false }: BalanceProps) {
  const { config, updateConfig } = useContext(ConfigContext)
  const { toFiat, fiatDecimals } = useContext(FiatContext)

  const fiatAmount = toFiat(amount)
  const btcAmount = fromSatoshis(amount)
  const fiatSymbol = FIAT_SYMBOLS[config.fiat]

  const btcBalance = config.showBalance ? prettyNumber(btcAmount, ASSETS.BTC.precision) : prettyHide(btcAmount, '')
  const fiatBalanceRaw = config.showBalance
    ? prettyNumber(fiatAmount, fiatDecimals(), true, fiatDecimals())
    : prettyHide(fiatAmount, '')
  const fiatBalance = fiatSymbol && fiatBalanceRaw ? `${fiatSymbol}${fiatBalanceRaw}` : fiatBalanceRaw
  const fiatUnit = fiatSymbol ? '' : config.fiat

  const showFiat = config.currencyDisplay === CurrencyDisplay.Fiat
  const mainBalance = usdOnly ? fiatBalance : showFiat ? fiatBalance : btcBalance
  const otherBalance = usdOnly ? '' : showFiat ? btcBalance : fiatBalance
  const mainUnit = usdOnly ? fiatUnit : showFiat ? fiatUnit : (amount === 1 ? 'SAT' : 'SATS')
  const otherUnit = usdOnly ? '' : showFiat ? (amount === 1 ? 'SAT' : 'SATS') : fiatUnit
  const showBoth = usdOnly ? false : config.currencyDisplay === CurrencyDisplay.Both

  const toggleShow = () => updateConfig({ ...config, showBalance: !config.showBalance })

  if (centered) {
    return (
      <div style={{ textAlign: 'center', marginBottom: 24, marginTop: 24 }}>
        <div style={{ fontSize: 14, color: 'var(--white50)', marginBottom: 8 }}>Wallet Balance</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: 'white', fontFamily: 'monospace' }}>
            {mainBalance}
          </div>
          {mainUnit ? <div style={{ fontSize: 20, fontWeight: 600, color: 'white', paddingTop: 8 }}>{mainUnit}</div> : null}
          <button
            type='button'
            onClick={toggleShow}
            aria-label={config.showBalance ? 'Hide balance' : 'Show balance'}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', background: 'none', border: 'none', color: 'inherit', paddingTop: 8 }}
          >
            <EyeIcon size={16} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <FlexCol gap='0' margin='2.5rem 0 1rem 0'>
      <FlexRow alignItems='baseline'>
        <Text bigger heading medium testId='main-balance'>
          {mainBalance}
        </Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {mainUnit ? <Text heading>{mainUnit}</Text> : null}
          <button
            type='button'
            onClick={toggleShow}
            aria-label={config.showBalance ? 'Hide balance' : 'Show balance'}
            style={{
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.25rem',
              background: 'none',
              border: 'none',
              color: 'inherit',
            }}
          >
            <EyeIcon size={16} />
          </button>
        </div>
      </FlexRow>
      {showBoth ? (
        <FlexRow alignItems='baseline'>
          <Text color='neutral-800'>{otherBalance}</Text>
          {otherUnit ? <Text small>{otherUnit}</Text> : null}
        </FlexRow>
      ) : null}
    </FlexCol>
  )
}
