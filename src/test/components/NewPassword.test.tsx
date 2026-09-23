import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import NewPassword, { isValidNewPassword } from '../../components/NewPassword'

describe('NewPassword', () => {
  it('requires the password policy before accepting matching passwords', () => {
    const onNewPassword = vi.fn()
    const { container } = render(<NewPassword onNewPassword={onNewPassword} setLabel={() => {}} />)
    const [password, confirmation] = container.querySelectorAll('input')

    fireEvent.change(password, { target: { value: 'weak' } })
    fireEvent.change(confirmation, { target: { value: 'weak' } })

    expect(onNewPassword).toHaveBeenLastCalledWith(null)

    fireEvent.change(password, { target: { value: 'Strong-pass1' } })
    fireEvent.change(confirmation, { target: { value: 'Strong-pass1' } })

    expect(onNewPassword).toHaveBeenLastCalledWith('Strong-pass1')
  })

  it('requires a minimum length, number, and special character', () => {
    expect(isValidNewPassword('short1!')).toBe(false)
    expect(isValidNewPassword('longpassword!')).toBe(false)
    expect(isValidNewPassword('longpassword1')).toBe(false)
    expect(isValidNewPassword('Strong-pass1')).toBe(true)
  })
})
