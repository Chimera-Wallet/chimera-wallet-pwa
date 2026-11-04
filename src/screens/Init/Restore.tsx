import { NavigationContext, Pages } from '../../providers/navigation'
import ButtonsOnBottom from '../../components/ButtonsOnBottom'
import { useContext, useEffect, useMemo, useState } from 'react'
import { ConfigContext } from '../../providers/config'
import { BackupProvider } from '../../lib/backup'
import { defaultArkServer, defaultPassword } from '../../lib/constants'
import { FlowContext } from '../../providers/flow'
import type { Config } from '../../lib/types'
import Content from '../../components/Content'
import FlexCol from '../../components/FlexCol'
import Loading from '../../components/Loading'
import { consoleError, consoleLog } from '../../lib/logs'
import Button from '../../components/Button'
import Header from '../../components/Header'
import Padded from '../../components/Padded'
import InputRecovery from '../../components/InputRecovery'
import { TextSecondary } from '../../components/Text'
import { OnboardStaggerContainer, OnboardStaggerChild } from '../../components/OnboardLoadIn'
import { deriveNostrKeyFromMnemonic } from '../../lib/mnemonic'
import { getRecoveryWord, parseRecoveryInput } from '../../lib/recoveryInput'
import { AspContext } from '../../providers/asp'
import {useTranslation} from 'react-i18next'

// The ARK server is env-only (single source of truth). A backup made on another
// network carries a different aspUrl; this detects that so we can ignore that
// backup's settings instead of importing them into the wrong network.
const serverHost = (url?: string): string | undefined => {
  if (!url) return undefined
  const withProto = /^https?:\/\//.test(url) ? url : `https://${url}`
  try {
    return new URL(withProto).host
  } catch {
    return undefined
  }
}

const isForeignArkServer = (backupUrl?: string): boolean => {
  const backup = serverHost(backupUrl)
  if (!backup) return false // no server in backup means nothing to cross
  return backup !== serverHost(defaultArkServer())
}

export default function InitRestore() {
  const { config, updateConfig } = useContext(ConfigContext)
  const { navigate } = useContext(NavigationContext)
  const { setInitInfo } = useContext(FlowContext)
  const { aspInfo } = useContext(AspContext)

  const {t} = useTranslation()

  const buttonLabel = t('common.general.continue')

  const [input, setInput] = useState<{ value: string; cursor: number | null }>({ value: '', cursor: null })
  const [submitted, setSubmitted] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreDone, setRestoreDone] = useState(false)
  const parsed = useMemo(() => parseRecoveryInput(input.value), [input.value])
  const mnemonic = parsed.kind === 'phrase' ? parsed.mnemonic : undefined
  const privateKey = parsed.kind === 'key' ? parsed.privateKey : undefined
  const activeWord = getRecoveryWord(input.value, input.cursor)

  // Stay quiet while the user is still typing: an unknown word is flagged once
  // the caret has left it, and the remaining errors only on Continue.
  let error = ''
  if (parsed.kind === 'phrase' && parsed.error === 'word') {
    if (submitted || activeWord?.index !== parsed.wordIndex) {
      error = t('init.restore.wordError', { number: parsed.wordIndex! + 1 })
    }
  } else if (submitted && parsed.kind !== 'empty' && parsed.error) {
    if (parsed.error === 'count') error = t('init.restore.wordCountError')
    if (parsed.error === 'checksum') error = t('init.restore.checksumError')
    if (parsed.error === 'key') error = t('init.restore.keyError')
  }

  const helperText =
    parsed.kind === 'phrase'
      ? t('init.restore.wordCount', { count: parsed.count })
      : t('init.restore.inputHint')

  const handleChange = (value: string, cursor: number | null) => {
    if (value !== input.value) setSubmitted(false)
    setInput({ value, cursor })
  }

  const handleCancel = () => navigate(Pages.Init)

  const handleProceed = () => {
    setSubmitted(true)
    if ((!mnemonic && !privateKey) || restoring) return
    setRestoring(true)
    let seckey: Uint8Array
    if (mnemonic) {
      setInitInfo({ mnemonic, password: defaultPassword, restoring: true })
      const isNet =
        aspInfo.network !== 'testnet' &&
        aspInfo.network !== 'mutinynet' &&
        aspInfo.network !== 'signet' &&
        aspInfo.network !== 'regtest'
      seckey = deriveNostrKeyFromMnemonic(mnemonic, isNet)
    } else {
      setInitInfo({ privateKey, password: defaultPassword, restoring: true })
      seckey = privateKey!
    }
    new BackupProvider({ seckey })
      .restore((conf) => {
        // A recovery phrase is network-agnostic and the same one is legitimately
        // used on more than one network. The Nostr backup is keyed by the phrase,
        // so restoring on staging can turn up the mainnet backup. That must not
        // block the restore — the wallet is rebuilt from the phrase itself, and
        // this callback only imports preferences. Skip a foreign network's
        // settings (its importedAssets are asset IDs that mean nothing here) and
        // let the restore continue with local defaults.
        if (isForeignArkServer(conf.aspUrl)) {
          consoleLog('Backup belongs to another network; keeping local settings')
          return
        }
        // Never adopt network-critical fields (aspUrl, delegate) from a backup;
        // only the user's preferences are safe to restore.
        const preferences: Partial<Config> = { ...conf }
        delete preferences.aspUrl
        delete preferences.delegate
        updateConfig({ ...config, ...preferences })
      })
      .catch((err) => consoleError(err, 'Error restoring from nostr'))
      .finally(() => setRestoreDone(true))
  }

  const handleExitComplete = () => navigate(Pages.InitConnect)

  // Navigate once restore is done (no exit animation with chimera Loading)
  useEffect(() => {
    if (!restoreDone) return
    handleExitComplete()
  }, [restoreDone])

  const disabled = !input.value.trim()

  if (restoring)
    return <Loading text={t('init.restore.restoringWallet')} />

  return (
    <>
      <Header text={t('init.init.restoreWallet')} back />
      <Content>
        <Padded>
          <OnboardStaggerContainer>
            <OnboardStaggerChild>
              <FlexCol between>
                <InputRecovery
                  value={input.value}
                  cursor={input.cursor}
                  onChange={handleChange}
                  onSubmit={handleProceed}
                  error={error}
                  helperText={helperText}
                />
                <TextSecondary wrap>
                  {t('init.restore.phraseEntry')}
                </TextSecondary>
              </FlexCol>
            </OnboardStaggerChild>
          </OnboardStaggerContainer>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button onClick={handleProceed} label={buttonLabel} disabled={disabled} />
        <Button onClick={handleCancel} label={t('common.general.cancel')} secondary />
      </ButtonsOnBottom>
    </>
  )
}
