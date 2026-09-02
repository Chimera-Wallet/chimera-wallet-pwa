import { invalidPrivateKey, nsecToPrivateKey } from '../../lib/privateKey'
import { NavigationContext, Pages } from '../../providers/navigation'
import ButtonsOnBottom from '../../components/ButtonsOnBottom'
import { useContext, useEffect, useState } from 'react'
import { ConfigContext } from '../../providers/config'
import { BackupProvider } from '../../lib/backup'
import { defaultArkServer, defaultPassword } from '../../lib/constants'
import { FlowContext } from '../../providers/flow'
import type { Config } from '../../lib/types'
import ErrorMessage from '../../components/Error'
import Content from '../../components/Content'
import FlexCol from '../../components/FlexCol'
import { extractError } from '../../lib/error'
import Loading from '../../components/Loading'
import { consoleError, consoleLog } from '../../lib/logs'
import Button from '../../components/Button'
import Header from '../../components/Header'
import Padded from '../../components/Padded'
import Input from '../../components/Input'
import { TextSecondary } from '../../components/Text'
import { hex } from '@scure/base'
import { IndexedDbSwapRepository } from '@arkade-os/boltz-swap'
import { OnboardStaggerContainer, OnboardStaggerChild } from '../../components/OnboardLoadIn'
import { validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { deriveNostrKeyFromMnemonic } from '../../lib/mnemonic'
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

  const [error, setError] = useState('')
  const [label, setLabel] = useState(buttonLabel)
  const [mnemonic, setMnemonic] = useState<string>()
  const [privateKey, setPrivateKey] = useState<Uint8Array>()
  const [restoring, setRestoring] = useState(false)
  const [restoreDone, setRestoreDone] = useState(false)
  const [someKey, setSomeKey] = useState<string>()

  useEffect(() => {
    const trimmed = someKey?.trim() ?? ''
    if (!trimmed) {
      setMnemonic(undefined)
      setPrivateKey(undefined)
      setLabel(buttonLabel)
      setError('')
      return
    }

    // Detect mnemonic (input contains spaces)
    if (trimmed.includes(' ')) {
      if (validateMnemonic(trimmed, wordlist)) {
        setMnemonic(trimmed)
        setPrivateKey(undefined)
        setLabel(buttonLabel)
        setError('')
      } else {
        setMnemonic(undefined)
        setPrivateKey(undefined)
        setLabel(t('init.restore.invalidPhrase'))
        setError(t('init.restore.invalidPhrase'))
      }
      return
    }

    // Otherwise try nsec/hex private key
    setMnemonic(undefined)
    let pk = undefined
    try {
      if (trimmed.match(/^nsec/)) pk = nsecToPrivateKey(trimmed)
      else pk = hex.decode(trimmed)
      const invalid = invalidPrivateKey(pk)
      setLabel(invalid ? t('init.restore.validationUnable') : buttonLabel)
      setError(invalid)
    } catch (err) {
      setLabel( t('init.restore.validationUnableSimple'))
      setError(extractError(err))
    }
    setPrivateKey(pk)
  }, [someKey])

  const handleCancel = () => navigate(Pages.Init)

  const handleProceed = () => {
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
    new BackupProvider({ seckey }, new IndexedDbSwapRepository())
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

  const handleExitComplete = () => {
    if (error) return setRestoring(false)
    else navigate(Pages.InitConnect)
  }

  // Navigate once restore is done (no exit animation with chimera Loading)
  useEffect(() => {
    if (!restoreDone) return
    handleExitComplete()
  }, [restoreDone])

  const disabled = Boolean((!privateKey && !mnemonic) || error)

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
                <FlexCol>
                  <Input name={t('init.restore.pk')} label={t('init.restore.recoveryPhraseKey')} onChange={setSomeKey} />
                  <ErrorMessage error={Boolean(error)} text={error} />
                </FlexCol>
                <TextSecondary wrap>
                  {t('init.restore.phraseEntry')}
                </TextSecondary>
              </FlexCol>
            </OnboardStaggerChild>
          </OnboardStaggerContainer>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button onClick={handleProceed} label={label} disabled={disabled} />
        <Button onClick={handleCancel} label={t('common.general.cancel')} secondary />
      </ButtonsOnBottom>
    </>
  )
}
