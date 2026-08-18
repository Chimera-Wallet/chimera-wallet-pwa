import { useEffect, useState } from 'react'
import InputPassword from './InputPassword'
import FlexCol from './FlexCol'
import CheckList from './CheckList'
import { StrengthBars, calcStrength } from './Strength'
import { useTranslation } from 'react-i18next'

interface NewPasswordProps {
  setLabel: (label: string) => void
  onNewPassword: (password: string | null) => void
}

export default function NewPassword({ onNewPassword, setLabel }: NewPasswordProps) {
  const [confirm, setConfirm] = useState('')
  const [focus, setFocus] = useState('password')
  const [password, setPassword] = useState('')
  const [strength, setStrength] = useState(0)
  const {t} = useTranslation()

  useEffect(() => {
    onNewPassword(password === confirm ? password : null)
    if (!password || password !== confirm) return setLabel(t('components.newPass.passwordMatch'))
    setLabel(t('components.newPass.save'))
  }, [password, confirm])

  const handleChangePassword = (e: any) => {
    const pass = e.target.value
    setStrength(calcStrength(pass))
    setPassword(pass)
  }

  const handleChangeConfirm = (e: any) => setConfirm(e.target.value)

  const handleEnter = () => {
    if (!password) setFocus('password')
    else if (!confirm) setFocus('confirm')
  }

  const passwordChecks = [
    {
      text: t('components.newPass.charMin'),
      done: password.length > 7,
    },
    {
      text: t('components.newPass.num'),
      done: /\d/.test(password),
    },
    {
      text: t('components.newPass.special'),
      done: /\W/.test(password),
    },
  ]

  return (
    <FlexCol gap='1.5em'>
      <FlexCol testId='new-password'>
        <InputPassword
          focus={focus === 'password'}
          label={t('components.newPass.pass')}
          onChange={handleChangePassword}
          onEnter={handleEnter}
        />
        <StrengthBars strength={strength} />
        <CheckList data={passwordChecks} />
      </FlexCol>
      <FlexCol testId='confirm-password'>
        <InputPassword
          focus={focus === 'confirm'}
          label={t('components.newPass.confirm')}
          onChange={handleChangeConfirm}
          onEnter={handleEnter}
        />
      </FlexCol>
    </FlexCol>
  )
}
