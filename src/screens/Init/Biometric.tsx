import { useContext, useState } from 'react'
import Header from '../../components/Header'
import Content from '../../components/Content'
import Padded from '../../components/Padded'
import FlexCol from '../../components/FlexCol'
import Text, { TextSecondary } from '../../components/Text'
import Button from '../../components/Button'
import ButtonsOnBottom from '../../components/ButtonsOnBottom'
import { WalletContext } from '../../providers/wallet'
import { NavigationContext, Pages } from '../../providers/navigation'
import { FlowContext } from '../../providers/flow'
import { isBiometricsSupported, registerUser } from '../../lib/biometrics'
import { reencryptSecret } from '../../lib/lock'
import { isValidPassword } from '../../lib/privateKey'
import { defaultPassword } from '../../lib/constants'
import ErrorMessage from '../../components/Error'
import { consoleError } from '../../lib/logs'
import { hapticSubtle } from '../../lib/haptics'
import CenterScreen from '../../components/CenterScreen'
import LockIcon from '../../icons/Lock'
import { OnboardStaggerContainer, OnboardStaggerChild } from '../../components/OnboardLoadIn'
import {useTranslation} from 'react-i18next'

export default function InitBiometric() {
  const { updateWallet, unlockWallet, refreshAuthState, wallet } = useContext(WalletContext)
  const { navigate } = useContext(NavigationContext)
  const { initInfo, setInitInfo } = useContext(FlowContext)

  const biometricsSupported = isBiometricsSupported()
  // During onboarding the secret is still in `initInfo` and InitConnect does the
  // re-encrypting. Reached without one, this is an existing wallet that has no
  // lock yet (App holds it here), so re-encrypt in place and boot it ourselves.
  const isOnboarding = Boolean(initInfo.mnemonic || initInfo.privateKey)

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const {t} = useTranslation()

  const handleEnableBiometrics = async () => {
    hapticSubtle()
    setError('')
    setBusy(true)
    try {
      // The wallet only belongs on this screen while its secret still decrypts
      // with defaultPassword. If a lock was already set (an earlier attempt, or
      // a stale auth state) re-encrypting would throw, so re-derive the state
      // and let App route to Unlock instead. Checked before registerUser so a
      // dead-end attempt doesn't leave an orphan passkey behind.
      if (!isOnboarding && !(await isValidPassword(defaultPassword))) return refreshAuthState()
      const { password, passkeyId } = await registerUser()
      if (isOnboarding) {
        updateWallet({ ...wallet, lockedByBiometrics: true, passkeyId })
        setInitInfo({ ...initInfo, password, lockDone: true })
        navigate(Pages.InitConnect)
        return
      }
      await reencryptSecret(defaultPassword, password)
      updateWallet({ ...wallet, lockedByBiometrics: true, passkeyId })
      await unlockWallet(password)
      navigate(Pages.Wallet)
    } catch (err) {
      consoleError(err, 'Biometric registration failed')
      setError(t('errors.biometric.failedEnable'))
      setBusy(false)
    }
  }

  const handleContinue = () => {
    navigate(Pages.InitPassword)
  }

  // A leftover `lockedByBiometrics` flag used to short-circuit to InitConnect
  // here, but the passkey password behind it is unrecoverable, so that path
  // dead-ended with "missing credentials". The screen always offers a fresh
  // registration instead — onboarding must not end without a working lock.

  return (
    <>
      <Header text={t('init.biometrics.secureWallet')} />
      <Content>
        <Padded>
          <CenterScreen>
            <OnboardStaggerContainer centered>
              <OnboardStaggerChild>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <LockIcon big />
                </div>
              </OnboardStaggerChild>
              <OnboardStaggerChild>
                <FlexCol gap='1rem' centered>
                  <Text big centered heading wrap>
                    {t('init.biometrics.enableBioAuth')}
                  </Text>
                </FlexCol>
              </OnboardStaggerChild>
              <OnboardStaggerChild>
                <FlexCol gap='1.5rem' centered>
                  {!biometricsSupported ? (
                    <TextSecondary centered wrap>
                      {t('init.biometrics.bioAuthUnsupported')}
                    </TextSecondary>
                  ) : (
                    <TextSecondary centered wrap>
                     {t('init.biometrics.fingerFaceAuth')}
                    </TextSecondary>
                  )}
                </FlexCol>
              </OnboardStaggerChild>
              <OnboardStaggerChild>
                <ErrorMessage error={Boolean(error)} text={error} />
              </OnboardStaggerChild>
            </OnboardStaggerContainer>
          </CenterScreen>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        {biometricsSupported ? (
          <>
            <Button
              onClick={handleEnableBiometrics}
              label={t('init.biometrics.enableBio')}
              loading={busy}
              disabled={busy}
            />
            <Button onClick={handleContinue} label={t('init.biometrics.usePass')} secondary disabled={busy} />
          </>
        ) : (
          <Button onClick={handleContinue} label={t('common.general.continue')} />
        )}
      </ButtonsOnBottom>
    </>
  )
}
