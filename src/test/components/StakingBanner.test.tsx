import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import '../../lib/i18n'
import StakingBanner from '../../components/StakingBanner'

describe('StakingBanner', () => {
  it('can be closed from the home screen', () => {
    const onDismiss = vi.fn()
    render(<StakingBanner variant='home' onDismiss={onDismiss} />)
    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('shows no close button when nothing handles it', () => {
    render(<StakingBanner variant='home' />)
    expect(screen.queryByLabelText('Dismiss')).not.toBeInTheDocument()
  })
})
