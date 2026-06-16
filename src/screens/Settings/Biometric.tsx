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
import { getPrivateKey, setPrivateKey, noUserDefinedPassword, isValidPassword } from '../../lib/privateKey'
import { hasMnemonic, getMnemonic, setMnemonic } from '../../lib/mnemonic'
import { defaultPassword } from '../../lib/constants'
import NeedsPassword from '../../components/NeedsPassword'
import { OptionsContext } from '../../providers/options'

export default function Biometric() {
  const { updateWallet, wallet } = useContext(WalletContext)
  const { goBack } = useContext(OptionsContext)
  const [currentPassword, setCurrentPassword] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [error, setError] = useState('')

  const biometricsSupported = isBiometricsSupported()
  const biometricsEnabled = wallet.lockedByBiometrics || false

  // Auto-detect if using default password
  useEffect(() => {
    noUserDefinedPassword().then((noPassword) => {
      if (noPassword) setCurrentPassword(defaultPassword)
    })
  }, [])

  // Validate password when set
  useEffect(() => {
    if (!currentPassword) return
    isValidPassword(currentPassword).then((isValid) => {
      setError(isValid ? '' : 'Invalid password')
      setAuthenticated(isValid)
    })
  }, [currentPassword])

  // Re-encrypt the wallet secret from one password to another. The secret is
  // the mnemonic when present (the primary store that lock detection and
  // unlockWallet read), otherwise the raw private key. Mirrors Password.tsx.
  const reencryptSecret = async (fromPassword: string, toPassword: string) => {
    if (hasMnemonic()) {
      const mnemonic = await getMnemonic(fromPassword)
      await setMnemonic(mnemonic, toPassword)
    } else {
      const privateKey = await getPrivateKey(fromPassword)
      await setPrivateKey(privateKey, toPassword)
    }
  }

  const handleToggle = async () => {
    hapticSubtle()

    if (biometricsEnabled) {
      // Disable biometrics - re-encrypt the secret with the default password
      try {
        await reencryptSecret(currentPassword, defaultPassword)
        updateWallet({ ...wallet, lockedByBiometrics: false, passkeyId: undefined })
        setCurrentPassword(defaultPassword)
        goBack()
      } catch (err) {
        consoleError(err, 'Failed to disable biometrics')
        setError('Failed to disable biometrics. Please try again.')
      }
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
        setError('Failed to enable biometrics. Please try again.')
      }
    }
  }

  // Require authentication before showing toggle
  if (!authenticated) {
    return <NeedsPassword error={error} onPassword={setCurrentPassword} />
  }

  return (
    <>
      <Header text='Biometric Authentication' back />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
            {!biometricsSupported ? (
              <TextSecondary>Biometric authentication is not supported on this device</TextSecondary>
            ) : (
              <Toggle
                checked={biometricsEnabled}
                onClick={handleToggle}
                text='Use Biometrics'
                subtext={
                  biometricsEnabled
                    ? 'Biometric authentication is active. Disabling it will remove your current lock — you can then set a password from Advanced Settings.'
                    : 'Enable fingerprint or face recognition to unlock your wallet. This will replace your current password.'
                }
              />
            )}
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
