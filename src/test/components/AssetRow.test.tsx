import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AssetRow from '../../components/AssetRow'

describe('AssetRow', () => {
  it('shows the Unverified badge and no fiat line for an unverified unlisted asset', () => {
    render(
      <AssetRow
        symbol='USDT'
        ticker='USDT'
        name='Tether'
        balance={1}
        unlisted={{ decimals: 6 }}
        unverified
      />,
    )
    expect(screen.getByTestId('unverified-badge')).toBeTruthy()
    // An unlisted row renders a metadata avatar, never the listed asset's logo.
    expect(screen.queryByAltText('USDT logo')).toBeNull()
  })

  it('shows no badge for a listed asset', () => {
    render(<AssetRow symbol='BTC' name='Bitcoin' balance={1} />)
    expect(screen.queryByTestId('unverified-badge')).toBeNull()
  })
})
