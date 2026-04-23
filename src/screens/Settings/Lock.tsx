import { useContext, useEffect, useState } from 'react'
import Button from '../../components/Button'
import ButtonsOnBottom from '../../components/ButtonsOnBottom'
import { WalletContext } from '../../providers/wallet'
import Padded from '../../components/Padded'
import { NavigationContext, Pages } from '../../providers/navigation'
import { extractError } from '../../lib/error'
import Content from '../../components/Content'
import ErrorMessage from '../../components/Error'
import Header from './Header'
import Text, { TextSecondary } from '../../components/Text'
import CenterScreen from '../../components/CenterScreen'
import { consoleError } from '../../lib/logs'
import LockIcon from '../../icons/Lock'
import { noUserDefinedPassword } from '../../lib/privateKey'
import { OptionsContext } from '../../providers/options'
import { SettingsOptions } from '../../lib/types'

export default function Lock() {
  const { setOption } = useContext(OptionsContext)
  const { navigate } = useContext(NavigationContext)
  const { lockWallet, wallet } = useContext(WalletContext)

  const [error, setError] = useState('')
  const [noPassword, setNoPassword] = useState(true)

  const biometricsEnabled = wallet.lockedByBiometrics || false
  const canLock = biometricsEnabled || !noPassword

  useEffect(() => {
    noUserDefinedPassword().then(setNoPassword)
  }, [])

  const handleSetPassword = () => {
    setOption(SettingsOptions.Password)
    navigate(Pages.Settings)
  }

  const handleLock = async () => {
    try {
      await lockWallet()
      // Don't manually navigate - let App.tsx handle it via the initialized state change
    } catch (err) {
      consoleError(err, 'error locking wallet')
      setError(extractError(err))
    }
  }

  return (
    <>
      <Header text='Lock' back />
      <Content>
        <Padded>
          <ErrorMessage error={Boolean(error)} text={error} />
          <CenterScreen>
            <LockIcon big />
            <Text centered>{!canLock ? 'No password or biometrics defined' : 'Lock your wallet'}</Text>
            <TextSecondary centered>
              {!canLock
                ? 'You need to set a password or enable biometrics to lock.'
                : biometricsEnabled
                  ? "After locking you'll need to authenticate with biometrics to unlock."
                  : "After locking you'll need to re-enter your password to unlock."}
            </TextSecondary>
          </CenterScreen>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        {!canLock ? (
          <Button onClick={handleSetPassword} label='Set Password' />
        ) : (
          <Button onClick={handleLock} label='Lock Wallet' />
        )}
      </ButtonsOnBottom>
    </>
  )
}
