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
import { authenticateUser, isBiometricsSupported, recoverPasskeyAuth } from '../lib/biometrics'
import { isValidPassword } from '../lib/privateKey'
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
  const { wallet, updateWallet } = useContext(WalletContext)
  const [password, setPassword] = useState('')
  const [biometricFailed, setBiometricFailed] = useState(false)
  const [biometricError, setBiometricError] = useState('')
  const [recovering, setRecovering] = useState(false)
  const {t} = useTranslation()

  // The biometric branches below used to render no error at all, so a failed
  // unlock looked identical to not having tried yet: the OS prompt succeeded
  // and the screen simply sat there. Whatever went wrong has to be visible.
  const shownError = error || biometricError

  const handleBiometrics = () => {
    setBiometricFailed(false)
    setBiometricError('')
    authenticateUser(wallet.passkeyId)
      .then((biometricPassword) => {
        // Guard the caller as well as the library: an empty password would be
        // dropped by the unlock effect, leaving the user staring at a screen
        // that just told them authentication succeeded.
        if (!biometricPassword) throw new Error('Passkey returned no user handle')
        onPassword(biometricPassword)
      })
      .catch((err) => {
        consoleError(err, 'Biometric authentication failed')
        setBiometricError(err instanceof Error ? err.message : String(err))
        setBiometricFailed(true)
      })
  }

  // Recovery for a wallet that is locked under a passkey password but has lost
  // `lockedByBiometrics`/`passkeyId` from its record — those wallets render the
  // password branch below and would otherwise have no way in at all, since the
  // password only ever existed inside the passkey.
  //
  // The recovered handle is checked against the stored secret BEFORE anything is
  // written, so answering with an unrelated passkey reports a mismatch instead
  // of marking the wallet biometric with a passkey that cannot open it.
  const handlePasskeyRecovery = async () => {
    setBiometricError('')
    setRecovering(true)
    try {
      const { password: recovered, passkeyId } = await recoverPasskeyAuth()
      if (!(await isValidPassword(recovered))) {
        throw new Error(t('components.needsPass.passkeyMismatch'))
      }
      updateWallet((prev) => ({ ...prev, lockedByBiometrics: true, passkeyId }))
      onPassword(recovered)
    } catch (err) {
      consoleError(err, 'Passkey recovery failed')
      setBiometricError(err instanceof Error ? err.message : String(err))
    } finally {
      setRecovering(false)
    }
  }

  // Only worth offering where a passkey could exist at all.
  const canTryPasskey = !wallet.lockedByBiometrics && isBiometricsSupported()

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
            <ErrorMessage text={shownError} error={Boolean(shownError)} />
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
            <ErrorMessage text={shownError} error={Boolean(shownError)} />
            <Button onClick={handleBiometrics} label={t('components.needsPass.unlockBio')} loading={loading} disabled={loading} />
            {onRestore ? restoreLink(t('components.needsPass.restorePhrase')) : null}
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
          <ErrorMessage text={shownError} error={Boolean(shownError)} />
          <Button onClick={handleClick} label={t('components.needsPass.unlock')} loading={loading} disabled={loading} />
          {canTryPasskey ? (
            <Button
              onClick={handlePasskeyRecovery}
              label={t('components.needsPass.unlockBio')}
              secondary
              loading={recovering}
              disabled={loading || recovering}
            />
          ) : null}
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
                <ErrorMessage text={shownError} error={Boolean(shownError)} />
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
              <ErrorMessage text={shownError} error={Boolean(shownError)} />
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
              <ErrorMessage text={shownError} error={Boolean(shownError)} />
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
        {canTryPasskey ? (
          <Button
            onClick={handlePasskeyRecovery}
            label={t('components.needsPass.unlockBio')}
            secondary
            loading={recovering}
            disabled={loading || recovering}
          />
        ) : null}
      </ButtonsOnBottom>
    </>
  )
}
