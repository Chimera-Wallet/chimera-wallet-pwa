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

export default function InitBiometric() {
  const { updateWallet, wallet } = useContext(WalletContext)
  const { navigate } = useContext(NavigationContext)
  const { initInfo, setInitInfo } = useContext(FlowContext)

  const biometricsSupported = isBiometricsSupported()
  const biometricsEnabled = wallet.lockedByBiometrics || false

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
      <Header text='Secure Your Wallet' />
      <Content>
        <Padded>
          <CenterScreen>
            <OnboardStaggerContainer centered>
              <OnboardStaggerChild>
                <LockIcon big />
              </OnboardStaggerChild>
              <OnboardStaggerChild>
                <FlexCol gap='1rem'>
                  <Text big centered heading>
                    Enable Biometric Authentication
                  </Text>
                </FlexCol>
              </OnboardStaggerChild>
              <OnboardStaggerChild>
                <FlexCol gap='1.5rem'>
                  {!biometricsSupported ? (
                    <TextSecondary centered wrap>
                      Biometric authentication is not supported on this device. You'll need to use your password to
                      unlock your wallet.
                    </TextSecondary>
                  ) : (
                    <TextSecondary centered wrap>
                      For your security, enable biometric authentication to unlock your wallet using fingerprint or face
                      recognition.
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
            <Button onClick={handleEnableBiometrics} label='Enable Biometrics' />
            <Button onClick={handleContinue} label='Use password instead' secondary />
          </>
        ) : (
          <Button onClick={handleContinue} label='Continue' />
        )}
      </ButtonsOnBottom>
    </>
  )
}
