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

interface NeedsPasswordProps {
  error: string
  onPassword: (password: string) => void
  loading?: boolean
  onRestore?: () => void
}

export default function NeedsPassword({ error, onPassword, loading = false, onRestore }: NeedsPasswordProps) {
  const { wallet } = useContext(WalletContext)
  const [password, setPassword] = useState('')
  const [biometricFailed, setBiometricFailed] = useState(false)

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

  // Biometrics active and failed → show restore-only message
  if (wallet.lockedByBiometrics && biometricFailed) {
    return (
      <>
        <Content>
          <Padded>
            <CenterScreen>
              <LockIcon big />
              <FlexCol gap='0.5rem'>
                <Text centered heading>Passkey not found</Text>
                <TextSecondary centered wrap>
                  Your passkey could not be found on this device. You will need to restore your wallet using your secret phrase.
                </TextSecondary>
              </FlexCol>
            </CenterScreen>
          </Padded>
        </Content>
        <ButtonsOnBottom>
          <Button onClick={handleBiometrics} label='Try again' secondary disabled={loading} />
          {onRestore ? (
            <Button onClick={onRestore} label='Restore from secret phrase' disabled={loading} />
          ) : null}
        </ButtonsOnBottom>
      </>
    )
  }

  // Biometrics active and not yet failed → show biometric prompt
  if (wallet.lockedByBiometrics) {
    return (
      <>
        <Content>
          <Padded>
            <CenterScreen onClick={handleBiometrics}>
              <LockIcon big />
              <Text centered>Unlock with your passkey</Text>
            </CenterScreen>
          </Padded>
        </Content>
        <ButtonsOnBottom>
          <Button onClick={handleBiometrics} label='Unlock using biometrics' loading={loading} disabled={loading} />
        </ButtonsOnBottom>
      </>
    )
  }

  // No biometrics → password input only
  return (
    <>
      <Content>
        <Padded>
          <FlexCol gap='1rem'>
            <InputPassword
              focus
              label='Insert password'
              onChange={handleChange}
              onEnter={handleClick}
              placeholder='password'
            />
            <ErrorMessage text={error} error={Boolean(error)} />
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button onClick={handleClick} label='Unlock wallet' loading={loading} disabled={loading} />
      </ButtonsOnBottom>
    </>
  )
}
