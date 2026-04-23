import { useContext } from 'react'
import { prettyHide, prettyNumber } from '../lib/format'
import { CurrencyDisplay, Satoshis } from '../lib/types'
import { FiatContext } from '../providers/fiat'
import Text from './Text'
import FlexCol from './FlexCol'
import FlexRow from './FlexRow'
import EyeIcon from '../icons/Eye'
import { ConfigContext } from '../providers/config'
import { ASSETS } from '../lib/assets'

interface BalanceProps {
  amount: Satoshis
  centered?: boolean
  usdOnly?: boolean
}

export default function Balance({ amount, centered = false, usdOnly = false }: BalanceProps) {
  const { config, updateConfig } = useContext(ConfigContext)
  const { toFiat } = useContext(FiatContext)

  const fiatAmount = toFiat(amount)

  // Convert satoshis to BTC
  const btcAmount = amount / Math.pow(10, ASSETS.BTC.precision)

  const btcBalance = config.showBalance ? prettyNumber(btcAmount, ASSETS.BTC.precision) : prettyHide(btcAmount, '')
  const fiatBalance = config.showBalance ? prettyNumber(fiatAmount, 2) : prettyHide(fiatAmount, '')

  // If usdOnly is true, force fiat display
  const otherBalance = usdOnly ? '' : config.currencyDisplay === CurrencyDisplay.Fiat ? btcBalance : fiatBalance
  const mainBalance = usdOnly ? fiatBalance : config.currencyDisplay === CurrencyDisplay.Fiat ? fiatBalance : btcBalance
  const otherUnit = usdOnly ? '' : config.currencyDisplay === CurrencyDisplay.Fiat ? ASSETS.BTC.symbol : config.fiat
  const mainUnit = usdOnly
    ? config.fiat
    : config.currencyDisplay === CurrencyDisplay.Fiat
      ? config.fiat
      : ASSETS.BTC.symbol
  const showBoth = usdOnly ? false : config.currencyDisplay === CurrencyDisplay.Both

  const toggleShow = () => updateConfig({ ...config, showBalance: !config.showBalance })

  if (centered) {
    return (
      <div style={{ textAlign: 'center', marginBottom: 24, marginTop: 24 }}>
        <div style={{ fontSize: 14, color: 'var(--white50)', marginBottom: 8 }}>Wallet balance</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: 'white',
              fontFamily: 'monospace',
            }}
          >
            {mainBalance}
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, color: 'white', paddingTop: 8 }}>{mainUnit}</div>
          <div onClick={toggleShow} style={{ cursor: 'pointer', paddingTop: 8 }}>
            <EyeIcon />
          </div>
        </div>
      </div>
    )
  }

  return (
    <FlexCol gap='0' margin='3rem 0 2rem 0'>
      <Text smaller>Wallet balance</Text>
      <FlexRow>
        <Text bigger heading medium>
          {mainBalance}
        </Text>
        <div style={{ paddingTop: ' 0.75rem' }}>
          <Text heading>{mainUnit}</Text>
        </div>
        <div onClick={toggleShow} style={{ cursor: 'pointer' }}>
          <EyeIcon />
        </div>
      </FlexRow>
      {showBoth ? (
        <FlexRow>
          <Text>{otherBalance}</Text>
          <Text small>{otherUnit}</Text>
        </FlexRow>
      ) : null}
    </FlexCol>
  )
}
