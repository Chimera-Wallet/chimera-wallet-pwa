import { useContext, useState } from 'react'
import Text, { TextSecondary } from './Text'
import ErrorMessage from './Error'
import Button from './Button'
import Padded from './Padded'
import Content from './Content'
import FlexCol from './FlexCol'
import CenterScreen from './CenterScreen'
import { consoleError } from '../lib/logs'
import InputPassword from './InputPassword'
import ButtonsOnBottom from './ButtonsOnBottom'
import { WalletContext } from '../providers/wallet'
import { authenticateUser } from '../lib/biometrics'
import LockIcon from '../icons/Lock'
import OnboardingLayout from './OnboardingLayout'
import { useTranslation } from 'react-i18next'

interface NeedsPasswordProps {
  error: string
  onPassword: (password: string) => void
  loading?: boolean
  onRestore?: () => void
  // When true, render the full-screen onboarding visual (gradient + coins +
  // logo) instead of the standard light app-shell layout. Used by the wallet
  // Unlock screen so it matches the onboarding design; the Settings re-auth
  // gates leave it off and keep the plain layout.
  onboarding?: boolean
}

export default function NeedsPassword({
  error,
  onPassword,
  loading = false,
  onRestore,
  onboarding = false,
}: NeedsPasswordProps) {
  const { wallet } = useContext(WalletContext)
  const [password, setPassword] = useState('')
  const [biometricFailed, setBiometricFailed] = useState(false)
  const {t} = useTranslation()

  const handleBiometrics = () => {
    setBiometricFailed(false)
    authenticateUser(wallet.passkeyId)
      .then(onPassword)
      .catch((err) => {
        consoleError(err, 'Biometric authentication failed')
        setBiometricFailed(true)
      })
  }

  const handleChange = (ev: any) => setPassword(ev.target.value)
  const handleClick = () => onPassword(password)

  if (onboarding) {
    // Restore link styled for the dark gradient background.
    const restoreLink = (label: string) =>
      onRestore ? (
        <span
          onClick={onRestore}
          style={{
            cursor: 'pointer',
            textAlign: 'center',
            fontSize: '14px',
            fontWeight: 300,
            color: 'rgba(255, 255, 255, 0.8)',
            textDecoration: 'underline',
            display: 'block',
          }}
        >
          {label}
        </span>
      ) : null

    const secondaryText = (text: string) => (
      <p
        style={{
          color: 'rgba(255, 255, 255, 0.8)',
          fontFamily: 'Titillium Web',
          fontSize: '14px',
          textAlign: 'center',
          margin: '0 0 1rem',
        }}
      >
        {text}
      </p>
    )

    // Biometrics active and failed → restore-only message
    if (wallet.lockedByBiometrics && biometricFailed) {
      return (
        <OnboardingLayout>
          {secondaryText(t('components.needsPass.passkeyNF'))}
          <FlexCol gap='0'>
            <Button onClick={handleBiometrics} label={t('components.needsPass.tryAgain')} secondary disabled={loading} />
            {onRestore ? <Button onClick={onRestore} label={t('components.needsPass.restorePhrase')} disabled={loading} /> : null}
          </FlexCol>
        </OnboardingLayout>
      )
    }

    // Biometrics active and not yet failed → biometric prompt
    if (wallet.lockedByBiometrics) {
      return (
        <OnboardingLayout>
          <FlexCol gap='0'>
            <Button onClick={handleBiometrics} label={t('components.needsPass.unlockBio')} loading={loading} disabled={loading} />
          </FlexCol>
        </OnboardingLayout>
      )
    }

    // No biometrics → password input
    return (
      <OnboardingLayout>
        <FlexCol gap='1rem'>
          <InputPassword
            focus
            label={t('components.needsPass.insPass')}
            onChange={handleChange}
            onEnter={handleClick}
            placeholder={t('components.needsPass.pass')}
          />
          <ErrorMessage text={error} error={Boolean(error)} />
          <Button onClick={handleClick} label={t('components.needsPass.unlock')} loading={loading} disabled={loading} />
          {restoreLink(t('components.needsPass.forgot'))}
        </FlexCol>
      </OnboardingLayout>
    )
  }

  // Biometrics active and failed → show restore-only message
  if (wallet.lockedByBiometrics && biometricFailed) {
    return (
      <>
        <Content>
          <Padded>
            <CenterScreen>
              <LockIcon big />
              <FlexCol centered gap='0.5rem'>
                <Text centered heading>
                  {t('components.needsPass.passkeyNFText')}
                </Text>
                <TextSecondary centered wrap>
                  {t('components.needsPass.pkText')}
                </TextSecondary>
              </FlexCol>
            </CenterScreen>
          </Padded>
        </Content>
        <ButtonsOnBottom>
          <Button onClick={handleBiometrics} label={t('components.needsPass.tryAgain')} secondary disabled={loading} />
          {onRestore ? <Button onClick={onRestore} label={t('components.needsPass.restorePhrase')} disabled={loading} /> : null}
        </ButtonsOnBottom>
      </>
    )
  }

  // Biometrics active and not yet failed → show biometric prompt
  if (wallet.lockedByBiometrics) {
    return (
      <>
        <Content>
          <CenterScreen onClick={handleBiometrics}>
            <LockIcon big />
            <FlexCol centered gap='0.5rem'>
              <Text centered heading>
                {t('components.needsPass.welcome')}
              </Text>
              <TextSecondary centered wrap>
                {t('components.needsPass.unlockPk')}
              </TextSecondary>
            </FlexCol>
          </CenterScreen>
        </Content>
        <ButtonsOnBottom>
          <Button onClick={handleBiometrics} label={t('components.needsPass.unlockBio')} loading={loading} disabled={loading} />
        </ButtonsOnBottom>
      </>
    )
  }

  // No biometrics → password input only
  return (
    <>
      <Content>
        <Padded>
          <CenterScreen>
            <LockIcon big />
            <FlexCol centered gap='1rem'>
              <InputPassword
                focus
                label={t('components.needsPass.insPass')}
                onChange={handleChange}
                onEnter={handleClick}
                placeholder={t('components.needsPass.pass')}
              />
              <ErrorMessage text={error} error={Boolean(error)} />
              {onRestore ? (
                <span
                  onClick={onRestore}
                  style={{
                    cursor: 'pointer',
                    textAlign: 'center',
                    fontSize: '14px',
                    fontWeight: 300,
                    color: 'var(--neutral-500)',
                    textDecoration: 'underline',
                    display: 'block',
                  }}
                >
                  F{t('components.needsPass.forgot')}
                </span>
              ) : null}
            </FlexCol>
          </CenterScreen>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button onClick={handleClick} label={t('components.needsPass.unlock')} loading={loading} disabled={loading} />
      </ButtonsOnBottom>
    </>
  )
}
