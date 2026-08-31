import { useContext, useState } from 'react'
import Button from '../../components/Button'
import ButtonsOnBottom from '../../components/ButtonsOnBottom'
import { NavigationContext, Pages } from '../../providers/navigation'
import Padded from '../../components/Padded'
import NewPassword from '../../components/NewPassword'
import { FlowContext } from '../../providers/flow'
import Content from '../../components/Content'
import Header from '../../components/Header'
import ErrorMessage from '../../components/Error'
import { WalletContext } from '../../providers/wallet'
import { reencryptSecret } from '../../lib/lock'
import { isValidPassword } from '../../lib/privateKey'
import { defaultPassword } from '../../lib/constants'
import { consoleError } from '../../lib/logs'
import { OnboardStaggerContainer, OnboardStaggerChild } from '../../components/OnboardLoadIn'
import {useTranslation} from 'react-i18next'

export default function InitPassword() {
  const { navigate } = useContext(NavigationContext)
  const { initInfo, setInitInfo } = useContext(FlowContext)
  const { updateWallet, unlockWallet, refreshAuthState, wallet } = useContext(WalletContext)

  const [label, setLabel] = useState('')
  const [password, setPassword] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const {t} = useTranslation()

  // During onboarding the secret is still in `initInfo` and InitConnect does the
  // re-encrypting. Reached without one, this is an existing wallet that has no
  // lock yet (App holds it here), so re-encrypt in place and boot it ourselves.
  const isOnboarding = Boolean(initInfo.mnemonic || initInfo.privateKey)

  // A password is required: falling back to `defaultPassword` here would leave
  // the wallet in the 'passwordless' state, which unlocks itself on every boot.
  const handleContinue = async () => {
    if (!password) return
    if (isOnboarding) {
      setInitInfo({ ...initInfo, password, lockDone: true })
      navigate(Pages.InitConnect)
      return
    }
    setError('')
    setBusy(true)
    try {
      // The wallet only belongs on this screen while its secret still decrypts
      // with defaultPassword. If a lock was already set (an earlier attempt, or
      // a stale auth state) re-encrypting would throw, so re-derive the state
      // and let App route to Unlock instead.
      if (!(await isValidPassword(defaultPassword))) return refreshAuthState()
      await reencryptSecret(defaultPassword, password)
      // Clears any stale passkey: its password is gone, so biometrics would
      // leave the wallet unopenable.
      updateWallet({ ...wallet, lockedByBiometrics: false, passkeyId: undefined })
      await unlockWallet(password)
      navigate(Pages.Wallet)
    } catch (err) {
      consoleError(err, 'Failed to set wallet password')
      setError(t('errors.password.failedUpdate'))
      setBusy(false)
    }
  }

  return (
    <>
      {/* Flow-neutral: this screen is also reached when restoring, and when an
          existing wallet is held here because it has no lock yet */}
      <Header text={t('init.biometrics.secureWallet')} back />
      <Content>
        <Padded>
          <OnboardStaggerContainer>
            <OnboardStaggerChild>
              <NewPassword onNewPassword={setPassword} setLabel={setLabel} />
              <ErrorMessage error={Boolean(error)} text={error} />
            </OnboardStaggerChild>
          </OnboardStaggerContainer>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button onClick={handleContinue} label={label} disabled={!password || busy} loading={busy} />
      </ButtonsOnBottom>
    </>
  )
}
