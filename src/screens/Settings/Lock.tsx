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
import {useTranslation} from 'react-i18next'

export default function Lock() {
  const { setOption } = useContext(OptionsContext)
  const { navigate } = useContext(NavigationContext)
  const { lockWallet, wallet } = useContext(WalletContext)

  const [error, setError] = useState('')
  const [noPassword, setNoPassword] = useState(true)

  const {t} = useTranslation()

  const biometricsEnabled = wallet.lockedByBiometrics || false
  const canLock = biometricsEnabled || !noPassword

  useEffect(() => {
    noUserDefinedPassword().then(setNoPassword)
  }, [])

  const handleSetPassword = () => {
    setOption(SettingsOptions.Password)
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
      <Header text={t('common.general.lock')} back />
      <Content>
        <Padded>
          <ErrorMessage error={Boolean(error)} text={error} />
          <CenterScreen>
            <LockIcon big />
            <Text centered>{!canLock ? t('settings.lock.noPass') : t('settings.lock.lockWallet')}</Text>
            <TextSecondary centered>
              {!canLock
                ? t('settings.lock.lockReqs')
                : biometricsEnabled
                  ? t('settings.lock.lockBioWarn')
                  : t('settings.lock.lockPassWarn')}
            </TextSecondary>
          </CenterScreen>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        {!canLock ? (
          <Button onClick={handleSetPassword} label={t('settings.lock.setPass')} />
        ) : (
          <Button onClick={handleLock} label={t('settings.lock.lockWalletSimple')} />
        )}
      </ButtonsOnBottom>
    </>
  )
}
