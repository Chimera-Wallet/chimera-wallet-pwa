import { useContext, useEffect, useState } from 'react'
import Header from './Header'
import Content from '../../components/Content'
import Padded from '../../components/Padded'
import FlexCol from '../../components/FlexCol'
import { TextSecondary } from '../../components/Text'
import Toggle from '../../components/Toggle'
import { WalletContext } from '../../providers/wallet'
import { isBiometricsSupported, registerUser } from '../../lib/biometrics'
import { consoleError } from '../../lib/logs'
import { hapticSubtle } from '../../lib/haptics'
import { noUserDefinedPassword, isValidPassword } from '../../lib/privateKey'
import { reencryptSecret } from '../../lib/lock'
import { defaultPassword } from '../../lib/constants'
import NeedsPassword from '../../components/NeedsPassword'
import NewPassword from '../../components/NewPassword'
import Button from '../../components/Button'
import ButtonsOnBottom from '../../components/ButtonsOnBottom'
import ErrorMessage from '../../components/Error'
import { OptionsContext } from '../../providers/options'
import { useTranslation } from 'react-i18next'

export default function Biometric() {
  const { updateWallet, wallet } = useContext(WalletContext)
  const { goBack } = useContext(OptionsContext)
  const [currentPassword, setCurrentPassword] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [error, setError] = useState('')
  // Turning biometrics off swaps the lock for a password the user chooses here.
  const [choosingPassword, setChoosingPassword] = useState(false)
  const [newPassword, setNewPassword] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)

  const biometricsSupported = isBiometricsSupported()
  const biometricsEnabled = wallet.lockedByBiometrics || false

  // Auto-detect if using default password
  useEffect(() => {
    noUserDefinedPassword().then((noPassword) => {
      if (noPassword) setCurrentPassword(defaultPassword)
    })
  }, [])

  const { t } = useTranslation()

  // Validate password when set
  useEffect(() => {
    if (!currentPassword) return
    isValidPassword(currentPassword).then((isValid) => {
      setError(isValid ? '' : t('common.general.invalidPass'))
      setAuthenticated(isValid)
    })
  }, [currentPassword])

  const handleToggle = async () => {
    hapticSubtle()

    if (biometricsEnabled) {
      // Disabling never leaves the wallet without a lock: it used to re-encrypt
      // the secret with `defaultPassword`, a constant shipped in the bundle, so
      // anyone with the browser storage could decrypt the mnemonic (CertiK
      // pentest CWP-01). The user picks a replacement password first.
      setError('')
      setChoosingPassword(true)
    } else {
      // Enable biometrics - re-encrypt the secret with the biometric password
      try {
        const { password: biometricPassword, passkeyId } = await registerUser()
        await reencryptSecret(currentPassword, biometricPassword)
        updateWallet({ ...wallet, lockedByBiometrics: true, passkeyId })
        setCurrentPassword(biometricPassword)
        goBack()
      } catch (err) {
        consoleError(err, 'Failed to enable biometrics')
        setError(t('errors.biometric.failedEnable'))
      }
    }
  }

  const handleReplaceWithPassword = async () => {
    if (!newPassword || !authenticated) return
    try {
      setSaving(true)
      await reencryptSecret(currentPassword, newPassword)
      updateWallet({ ...wallet, lockedByBiometrics: false, passkeyId: undefined })
      setCurrentPassword(newPassword)
      goBack()
    } catch (err) {
      consoleError(err, 'Failed to disable biometrics')
      setError(t('errors.biometric.failedDisable'))
    } finally {
      setSaving(false)
    }
  }

  // Require authentication before showing toggle
  if (!authenticated) {
    return <NeedsPassword error={error} onPassword={setCurrentPassword} />
  }

  if (choosingPassword) {
    return (
      <>
        <Header text={t('settings.biometric.bioAuth')} backFunc={() => setChoosingPassword(false)} />
        <Content>
          <Padded>
            <FlexCol gap='1.5rem'>
              <TextSecondary wrap>{t('settings.biometric.choosePass')}</TextSecondary>
              <ErrorMessage text={error} error={Boolean(error)} />
              <NewPassword onNewPassword={setNewPassword} setLabel={setLabel} />
            </FlexCol>
          </Padded>
        </Content>
        <ButtonsOnBottom>
          <Button
            onClick={handleReplaceWithPassword}
            label={label}
            disabled={!newPassword || saving}
            loading={saving}
          />
        </ButtonsOnBottom>
      </>
    )
  }

  return (
    <>
      <Header text={t('settings.biometric.bioAuth')} back />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
            {!biometricsSupported ? (
              <TextSecondary>{t('settings.biometric.bioAuthUnsupported')}</TextSecondary>
            ) : (
              <Toggle
                checked={biometricsEnabled}
                onClick={handleToggle}
                text={t('settings.biometric.useBio')}
                subtext={
                  biometricsEnabled ? t('settings.biometric.disableWarn') : t('settings.biometric.enableFingerFace')
                }
              />
            )}
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
