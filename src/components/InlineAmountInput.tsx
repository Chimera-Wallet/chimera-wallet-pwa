import { useContext, useState } from 'react'
import { ConfigContext } from '../providers/config'
import { FiatContext } from '../providers/fiat'
import { prettyNumber } from '../lib/format'
import { ASSETS, getDisplayTicker, type AssetSymbol, unitsToCents } from '../lib/assets'
import CurrencySwapIcon from '../icons/CurrencySwap'

interface InlineAmountInputProps {
  value: number
  onChange: (value: number) => void
  asset: AssetSymbol
  allowFiat?: boolean
  onAssetAmountChange?: (value: bigint) => void
  precision?: number
  disabled?: boolean
  displayValue?: string
  placeholder?: string
  ticker?: string
  bankCurrency?: string // Optional: for bank transfers (EUR/CHF) - enables BTC<->bankCurrency swap
}

/**
 * Reusable inline amount input component with large centered text
 * Used across Send, Receive (Lightning), and Bank Transfer screens
 *
 * For regular crypto: swaps between BTC and user's fiat (USD/EUR via config)
 * For bank transfers: swaps between BTC and bank currency (EUR/CHF)
 */
export default function InlineAmountInput({
  value,
  onChange,
  asset,
  allowFiat = true,
  onAssetAmountChange,
  precision,
  disabled = false,
  displayValue: initialDisplayValue,
  placeholder = '0',
  ticker,
  bankCurrency,
}: InlineAmountInputProps) {
  const { config } = useContext(ConfigContext)
  const { toFiat, fromFiat, toCurrency, fromCurrency } = useContext(FiatContext)

  // Track whether user is entering in crypto or fiat
  const [inputMode, setInputMode] = useState<'crypto' | 'fiat'>('crypto')
  // Track the actual input string to avoid conversion issues during typing
  const [inputString, setInputString] = useState('')

  const assetInfo = ASSETS[asset]
  const assetTicker = ticker ? getDisplayTicker(ticker) : getDisplayTicker(asset)
  const isBankTransfer = Boolean(bankCurrency)

  // Calculate display values based on input mode
  // For bank transfers: value is in fiat cents/units, not satoshis
  const activeCurrency = bankCurrency || config.fiat
  const assetPrecision = precision ?? assetInfo.precision
  const cryptoValue = isBankTransfer
    ? fromCurrency(value, activeCurrency) / Math.pow(10, assetPrecision)
    : value / Math.pow(10, assetPrecision)

  const fiatValue = isBankTransfer
    ? value // For bank transfers, value IS the fiat amount
    : toFiat(value)

  // Use inputString while typing, or calculated value when empty/switching modes
  // Fiat values are always displayed to 2 decimal places
  const displayValue =
    inputString || initialDisplayValue || (inputMode === 'crypto' ? cryptoValue || '' : fiatValue ? parseFloat(fiatValue.toFixed(2)) : '')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value

    // Only allow numbers and decimal point
    const validInput = /^[0-9]*\.?[0-9]*$/.test(inputValue)
    if (!validInput && inputValue !== '') {
      return
    }

    setInputString(inputValue)

    if (onAssetAmountChange) {
      onAssetAmountChange(inputValue && inputValue !== '.' ? unitsToCents(inputValue, assetPrecision) : BigInt(0))
      return
    }

    if (inputValue === '' || inputValue === '0') {
      onChange(0)
    } else {
      const numValue = parseFloat(inputValue)
      if (!isNaN(numValue) && numValue >= 0) {
        let finalValue: number

        if (isBankTransfer) {
          // Bank transfer mode
          if (inputMode === 'fiat') {
            // User entered fiat amount directly
            finalValue = numValue
          } else {
            // User entered BTC, convert to fiat using real exchange rate
            finalValue = toCurrency(Math.floor(numValue * Math.pow(10, assetPrecision)), activeCurrency)
          }
        } else {
          // Regular crypto mode
          if (inputMode === 'fiat') {
            // User entered fiat, convert to satoshis
            finalValue = fromFiat(numValue)
          } else {
            // User entered crypto, convert to base units
            finalValue = Math.floor(numValue * Math.pow(10, assetPrecision))
          }
        }

        onChange(finalValue)
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Prevent 'e', 'E', '+', '-' which are valid in number inputs
    if (['e', 'E', '+', '-'].includes(e.key)) {
      e.preventDefault()
    }
  }

  const handleSwap = () => {
    setInputString('') // Clear input string when switching modes
    setInputMode(inputMode === 'crypto' ? 'fiat' : 'crypto')
  }

  // Display strings
  const primaryCurrency = inputMode === 'crypto' ? assetTicker : bankCurrency || config.fiat

  const secondaryValue =
    inputMode === 'crypto'
      ? `${prettyNumber(fiatValue, 2)} ${bankCurrency || config.fiat}`
      : `≈ ${prettyNumber(cryptoValue, 8)} ${assetTicker}`

  // Calculate dynamic font size based on number of digits
  const displayString = String(displayValue)
  const numDigits = displayString.length || 1
  const fontSize = numDigits <= 6 ? '2.5rem' : numDigits <= 10 ? '2rem' : '1.5rem'
  const currencyFontSize = numDigits <= 6 ? '1.25rem' : numDigits <= 10 ? '1rem' : '0.875rem'
  const inputWidth = `${Math.max(numDigits + 1, 4)}ch` // Dynamic width based on content

  return (
    <div style={{ textAlign: 'center', width: '100%', marginTop: '-0.8rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <input
          type='number'
          step='any'
          inputMode='decimal'
          value={displayValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            fontSize,
            fontWeight: 700,
            color: 'white',
            fontFamily: 'Titillium Web',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            textAlign: 'right',
            width: inputWidth,
            padding: '0.25rem',
          }}
        />
        <span style={{ fontSize: currencyFontSize, fontWeight: 600, color: 'white' }}>{primaryCurrency}</span>
      </div>
      {/* Swap icon */}
      {allowFiat ? (
        <button
          onClick={handleSwap}
          disabled={disabled}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: disabled ? 'default' : 'pointer',
            padding: '0.5rem',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled ? 0.5 : 1,
          }}
          aria-label='Toggle between crypto and fiat'
        >
          <div style={{ width: '20px', height: '20px', color: 'var(--white50)' }}>
            <CurrencySwapIcon />
          </div>
        </button>
      ) : null}
      </div>
      {/* Fiat/Crypto equivalent */}
      {allowFiat ? <div style={{ fontSize: '1rem', color: 'var(--white50)', marginTop: '-10px' }}>{secondaryValue}</div> : null}
    </div>
  )
}
