import { useToast } from '../../components/Toast'
import { useState, useEffect, useContext, useRef } from 'react'
import Button from '../../components/Button'
import Padded from '../../components/Padded'
import Content from '../../components/Content'
import { copyToClipboard } from '../../lib/clipboard'
import Header from './Header'
import Text, { TextSecondary } from '../../components/Text'
import FlexCol from '../../components/FlexCol'
import { getPrivateKey, privateKeyToNsec } from '../../lib/privateKey'
import { hasMnemonic, getMnemonic } from '../../lib/mnemonic'
import { consoleError } from '../../lib/logs'
import Shadow from '../../components/Shadow'
import { defaultPassword } from '../../lib/constants'
import { ConfigContext } from '../../providers/config'
import Toggle from '../../components/Toggle'
import { BackupProvider } from '../../lib/backup'
import ErrorMessage from '../../components/Error'
import SafeIcon from '../../icons/Safe'
import FlexRow from '../../components/FlexRow'
import DontIcon from '../../icons/Dont'
import XIcon from '../../icons/X'
import WarningBox from '../../components/Warning'
import Modal from '../../components/Modal'
import InputFake from '../../components/InputFake'
import OkIcon from '../../icons/Ok'
import { WalletContext } from '../../providers/wallet'
import { authenticateUser } from '../../lib/biometrics'
import FingerprintIcon from '../../icons/Fingerprint'
import InputPassword from '../../components/InputPassword'
import { IndexedDbSwapRepository } from '@arkade-os/boltz-swap'
import { SwapsContext } from '../../providers/swaps'
import {useTranslation} from 'react-i18next'

export default function Backup() {
  const { wallet } = useContext(WalletContext)
  const { arkadeSwaps } = useContext(SwapsContext)
  const { backupConfig, config, updateConfig } = useContext(ConfigContext)

  const { toast } = useToast()

  const isMnemonicWallet = hasMnemonic()

  const [secret, setSecret] = useState('')
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  const enteredPassword = useRef('')
  
  const {t} = useTranslation()

  useEffect(() => {
    verifyPassword(defaultPassword).then(setSecret)
  }, [])

  const verifyPassword = async (password: string): Promise<string> => {
    try {
      if (isMnemonicWallet) {
        return await getMnemonic(password)
      }
      const privateKey = await getPrivateKey(password)
      return privateKeyToNsec(privateKey)
    } catch {
      return ''
    }
  }

  const handleCopy = async () => {
    if (!secret) return
    await copyToClipboard(secret)
    toast(t('common.general.copyClipboard'))
  }

  const onChangePassword = (e: any) => {
    enteredPassword.current = e.target.value
  }

  const showPrivateKey = async () => {
    if (!secret) {
      const password = wallet.lockedByBiometrics
        ? await authenticateUser(wallet.passkeyId).catch(setError)
        : enteredPassword.current
      if (!password) return
      const result = await verifyPassword(password)
      if (!result) {
        setError(t('errors.json.initialisation.invalidPass'))
        return
      }
      setError('')
      setSecret(result)
    }
    setShowSecret(true)
    setDialog(false)
  }

  const toggleDialog = () => {
    setDialog(!dialog)
  }

  const toggleNostrBackup = async () => {
    const newConfig = { ...config, nostrBackup: !config.nostrBackup }
    updateConfig(newConfig)
    if (newConfig.nostrBackup) {
      const backupProvider = new BackupProvider({ pubkey: config.pubkey }, new IndexedDbSwapRepository())
      await backupProvider.fullBackup(newConfig, arkadeSwaps ?? undefined).catch((error) => {
        consoleError(error, 'Backup to Nostr failed')
        setError(t('errors.backup.nostrFail'))
        return
      })
    } else {
      backupConfig(newConfig)
    }
    toast(t('settings.backup.nostrUpdate'))
  }

  const secretLabel = isMnemonicWallet ? t('common.general.recoveryPhrase') : t('common.general.pk')

  const Dialog = () => (
    <FlexCol gap='1.5rem'>
      <FlexCol centered gap='0.5rem'>
        <Text big medium heading>
          {secretLabel}
        </Text>
        <TextSecondary centered wrap>
          {isMnemonicWallet
            ? t('settings.backup.mnemonicWarning')
            : t('settings.backup.pkWarning')}
        </TextSecondary>
      </FlexCol>
      {!secret ? (
        wallet.lockedByBiometrics ? (
          <FlexCol centered gap='0.5rem'>
            <FingerprintIcon />
            <Text centered>{t('settings.backup.unlockPasskey')}y</Text>
          </FlexCol>
        ) : (
          <FlexCol gap='0.5rem' testId='backup-password-input'>
            <TextSecondary>{t('settings.backup.enterPass')}</TextSecondary>
            <InputPassword onChange={onChangePassword} />
            <ErrorMessage error={Boolean(error)} text={error} />
          </FlexCol>
        )
      ) : null}
      <FlexCol gap='0.25rem'>
        <FlexRow>
          <SafeIcon />
          <TextSecondary> {t('settings.backup.keepSafeSecret',{secret: secretLabel.toLowerCase()})}</TextSecondary>
        </FlexRow>
        <FlexRow>
          <DontIcon />
          <TextSecondary>{t('settings.backup.noShare')}</TextSecondary>
        </FlexRow>
        <FlexRow>
          <XIcon />
          <TextSecondary>{t('settings.backup.loseNoRecover')}</TextSecondary>
        </FlexRow>
      </FlexCol>
      <FlexRow>
        <Button onClick={toggleDialog} label={t('common.general.cancel')} secondary />
        <Button onClick={showPrivateKey} label={t('common.general.confirm')} />
      </FlexRow>
    </FlexCol>
  )

  return (
    <>
      <Header text= {t('common.general.backup')} back />
      <Modal open={dialog} onOpenChange={setDialog}>
        <Dialog />
      </Modal>
      <Content>
        <Padded>
          <FlexCol gap='2rem'>
            <ErrorMessage error={Boolean(error)} text={error} />
            <FlexCol border gap='0.5rem' padding='0 0 1rem 0'>
              <Text thin>{secretLabel}</Text>
              <TextSecondary>{t('settings.backup.eyesOnly')}</TextSecondary>
              <Shadow lighter>
                <FlexCol gap='10px'>
                  <InputFake testId='private-key' text={showSecret ? secret : '*******'} />
                  {showSecret ? (
                    <Button onClick={handleCopy} label={t('common.general.copyClipboardPrompt')} />
                  ) : (
                    <Button onClick={toggleDialog} label={t('settings.backup.viewSecret',{secret: secretLabel.toLowerCase()})} />
                  )}
                  <FlexRow>
                    <OkIcon />
                    <Text small>{t('settings.backup.enoughToRestore')}</Text>
                  </FlexRow>
                </FlexCol>
              </Shadow>
              {showSecret ? (
                <WarningBox
                  text={
                    isMnemonicWallet
                      ? t('settings.backup.phraseAccess')
                      : t('settings.backup.pkAccess')
                  }
                />
              ) : null}
            </FlexCol>
            <Toggle
              checked={config.nostrBackup}
              onClick={toggleNostrBackup}
              text={t('settings.backup.enableNostr')}
              subtext={t('settings.backup.nostrToggle')}
              testId='toggle-backup'
            />
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
