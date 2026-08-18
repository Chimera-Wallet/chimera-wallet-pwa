import { useContext } from 'react'
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
import { consoleError } from '../../lib/logs'
import { hapticSubtle } from '../../lib/haptics'
import CenterScreen from '../../components/CenterScreen'
import LockIcon from '../../icons/Lock'
import { OnboardStaggerContainer, OnboardStaggerChild } from '../../components/OnboardLoadIn'
import {useTranslation} from 'react-i18next'

export default function InitBiometric() {
  const { updateWallet, wallet } = useContext(WalletContext)
  const { navigate } = useContext(NavigationContext)
  const { initInfo, setInitInfo } = useContext(FlowContext)

  const biometricsSupported = isBiometricsSupported()
  const biometricsEnabled = wallet.lockedByBiometrics || false

  const {t} = useTranslation()

  const handleEnableBiometrics = () => {
    hapticSubtle()
    registerUser()
      .then(({ password, passkeyId }) => {
        updateWallet({ ...wallet, lockedByBiometrics: true, passkeyId })
        setInitInfo({ ...initInfo, password })
        navigate(Pages.InitConnect)
      })
      .catch((err) => consoleError(err, 'Biometric registration failed'))
  }

  const handleContinue = () => {
    navigate(Pages.InitPassword)
  }

  // If biometrics are already enabled, continue to next step
  if (biometricsEnabled) {
    navigate(Pages.InitConnect)
    return null
  }

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
            </OnboardStaggerContainer>
          </CenterScreen>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        {biometricsSupported ? (
          <>
            <Button onClick={handleEnableBiometrics} label={t('init.biometrics.enableBio')} />
            <Button onClick={handleContinue} label={t('init.biometrics.usePass')} secondary />
          </>
        ) : (
          <Button onClick={handleContinue} label={t('common.general.continue')} />
        )}
      </ButtonsOnBottom>
    </>
  )
}
