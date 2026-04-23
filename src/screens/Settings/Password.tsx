import Header from './Header'
import ErrorMessage from '../../components/Error'
import { consoleLog } from '../../lib/logs'
import Button from '../../components/Button'
import Padded from '../../components/Padded'
import Content from '../../components/Content'
import Success from '../../components/Success'
import { defaultPassword } from '../../lib/constants'
import { WalletContext } from '../../providers/wallet'
import NewPassword from '../../components/NewPassword'
import { useContext, useEffect, useState } from 'react'
import NeedsPassword from '../../components/NeedsPassword'
import ButtonsOnBottom from '../../components/ButtonsOnBottom'
import { getPrivateKey, isValidPassword, noUserDefinedPassword, setPrivateKey } from '../../lib/privateKey'
import Text, { TextSecondary } from '../../components/Text'
import CenterScreen from '../../components/CenterScreen'
import LockIcon from '../../icons/Lock'

export default function Password() {
  const { updateWallet, wallet } = useContext(WalletContext)

  const [authenticated, setAuthenticated] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState<string | null>(null)
  const [successText, setSuccessText] = useState('')
  const [error, setError] = useState('')
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    noUserDefinedPassword().then((noPassword) => {
      if (noPassword) setOldPassword(defaultPassword)
    })
  }, [])

  useEffect(() => {
    if (!oldPassword) return
    isValidPassword(oldPassword).then((isValid) => {
      setError(isValid ? '' : 'Invalid password')
      setAuthenticated(isValid)
    })
  }, [oldPassword])

  // Block password management when biometrics is active
  if (wallet.lockedByBiometrics) {
    return (
      <>
        <Header text='Change password' back />
        <Content>
          <Padded>
            <CenterScreen>
              <LockIcon big />
              <Text centered heading>
                Password unavailable
              </Text>
              <TextSecondary centered wrap>
                Biometric authentication is active. Disable it from Settings &gt; Biometric Authentication before
                setting a password.
              </TextSecondary>
            </CenterScreen>
          </Padded>
        </Content>
      </>
    )
  }

  const saveNewPassword = async (nextPassword: string | null): Promise<boolean> => {
    if (!oldPassword || nextPassword === null || !authenticated) return false
    const finalPassword = nextPassword === '' ? defaultPassword : nextPassword
    const privateKey = await getPrivateKey(oldPassword)
    try {
      setSaving(true)
      await setPrivateKey(privateKey, finalPassword)
      setSuccessText(finalPassword === defaultPassword ? 'Password removed' : 'Password changed')
      setError('')
      return true
    } catch {
      setError('Failed to update password')
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleContinue = async () => {
    const ok = await saveNewPassword(newPassword)
    if (ok) updateWallet({ ...wallet, lockedByBiometrics: false })
  }

  if (!authenticated && !successText) return <NeedsPassword error={error} onPassword={setOldPassword} />

  return (
    <>
      <Header text='Change password' back />
      <Content>
        {successText ? (
          <Success headline='Success' text={successText} />
        ) : (
          <Padded>
            <ErrorMessage text={error} error={Boolean(error)} />
            <NewPassword onNewPassword={setNewPassword} setLabel={setLabel} />
          </Padded>
        )}
      </Content>
      {successText ? null : (
        <ButtonsOnBottom>
          <Button onClick={handleContinue} label={label} disabled={!newPassword || saving} loading={saving} />
        </ButtonsOnBottom>
      )}
    </>
  )
}
