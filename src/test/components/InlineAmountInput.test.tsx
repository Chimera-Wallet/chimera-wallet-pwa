import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import InlineAmountInput from '../../components/InlineAmountInput'
import { ConfigContext } from '../../providers/config'
import { FiatContext } from '../../providers/fiat'
import { mockConfigContextValue, mockFiatContextValue } from '../screens/mocks'

describe('InlineAmountInput', () => {
  it('emits asset amounts as bigint base units using the supplied precision', () => {
    const onAssetAmountChange = vi.fn()
    render(
      <ConfigContext.Provider value={mockConfigContextValue as any}>
        <FiatContext.Provider value={mockFiatContextValue as any}>
          <InlineAmountInput
            asset='ETH'
            allowFiat={false}
            onAssetAmountChange={onAssetAmountChange}
            onChange={() => {}}
            precision={18}
            value={0}
          />
        </FiatContext.Provider>
      </ConfigContext.Provider>,
    )

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1.5' } })

    expect(onAssetAmountChange).toHaveBeenCalledWith(BigInt('1500000000000000000'))

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '.' } })

    expect(onAssetAmountChange).toHaveBeenLastCalledWith(BigInt(0))
  })

  it('renders small asset values without scientific notation', () => {
    render(
      <ConfigContext.Provider value={mockConfigContextValue as any}>
        <FiatContext.Provider value={mockFiatContextValue as any}>
          <InlineAmountInput asset='ETH' displayValue='0.00000000997' onChange={() => {}} value={9.97e-9} />
        </FiatContext.Provider>
      </ConfigContext.Provider>,
    )

    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('0.00000000997')
  })
})
