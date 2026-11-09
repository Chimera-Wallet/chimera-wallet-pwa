import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Details from '../../components/Details'

describe('Details component', () => {
  const props = {
    address: '123 Main St',
    arknote: 'Test Note',
    date: '2023-01-01',
    destination: '456 Elm St',
    direction: 'outgoing',
    fees: 1000,
    invoice: 'INV-123',
    satoshis: 100000,
    total: 1000,
    type: 'payment',
    when: '2023-01-01',
  }
  it('renders the details with the correct information', () => {
    render(<Details details={props} />)
    expect(screen.getByText('outgoing')).toBeInTheDocument()
  })

  it('shows bitcoin amounts in BTC, never SATS', () => {
    render(<Details details={props} />)
    expect(screen.getByText('0.001 BTC')).toBeInTheDocument()
    expect(screen.getAllByText('0.00001 BTC')).toHaveLength(2) // fees and total
    expect(screen.queryByText(/SATS/)).not.toBeInTheDocument()
  })
})
