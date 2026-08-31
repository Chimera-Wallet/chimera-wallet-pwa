import { useContext, useEffect, useState } from 'react'
import { FlowContext } from '../../providers/flow'
import Content from '../../components/Content'
import { WalletContext } from '../../providers/wallet'
import Loading from '../../components/Loading'
import Header from '../../components/Header'
import { setPrivateKey } from '../../lib/privateKey'
import { setMnemonic } from '../../lib/mnemonic'
import { consoleError, consoleLog } from '../../lib/logs'
import { SwapsContext } from '../../providers/swaps'
import { useLoadingStatus } from '../../hooks/useLoadingStatus'
import { setLoadingStatus } from '../../lib/loadingStatus'
import { NavigationContext, Pages } from '../../providers/navigation'
import {useTranslation} from 'react-i18next'

export default function InitConnect() {
  const { initInfo, setInitInfo } = useContext(FlowContext)
  const { arkadeSwaps, restoreSwaps } = useContext(SwapsContext)
  const { navigate } = useContext(NavigationContext)
  const { initWallet } = useContext(WalletContext)

  const loadingStatus = useLoadingStatus()
  const [error, setError] = useState<string>()
  const [initialized, setInitialized] = useState(false)
  const [connectDone, setConnectDone] = useState(false)

  const { password, privateKey, mnemonic } = initInfo

  const {t} = useTranslation()

  useEffect(() => {
    if (!password || (!mnemonic && !privateKey)) {
      abortConnectionWithError(new Error(t('init.connection.missingCreds')))
      return
    }
    if (mnemonic) {
      setMnemonic(mnemonic, password)
        .then(() => initWallet({ mnemonic }))
        .then(() => setInitialized(true))
        .catch(abortConnectionWithError)
    } else if (privateKey) {
      setPrivateKey(privateKey, password)
        .then(() => initWallet({ privateKey }))
        .then(() => setInitialized(true))
        .catch(abortConnectionWithError)
    }
  }, [])

  useEffect(() => {
    if (!initialized || !arkadeSwaps) return
    if (!initInfo.restoring) return setConnectDone(true)
    setLoadingStatus(t('init.connection.restoringSwaps'))
    restoreSwaps()
      .then((count) => count && consoleLog(t('init.connection.swapsInfo', {num:count})))
      .catch((err) => consoleError(err, 'Error restoring swaps:'))
      .finally(() => setConnectDone(true))
  }, [arkadeSwaps, initialized, initInfo.restoring])

  useEffect(() => {
    if (!connectDone) return
    if (error) {
      setInitInfo({ restoring: initInfo.restoring })
      navigate(Pages.Init)
      return
    }
    // The secret is still encrypted with `defaultPassword` at this point. Carry
    // it forward so the lock step can re-encrypt it with the real password;
    // drop the password itself so the next run of this screen uses the new one.
    const carried = {
      ...initInfo,
      password: undefined,
      mnemonic: mnemonic ?? undefined,
      privateKey: mnemonic ? undefined : privateKey,
    }
    if (!initInfo.backupDone && !initInfo.restoring) {
      // First run for a new wallet — show success/backup screens
      setInitInfo({ ...carried, restoring: false })
      navigate(Pages.InitSuccess)
    } else if (!initInfo.lockDone) {
      // Wallet exists but has no lock yet — this is the restore path, which
      // skips the backup screens. Every wallet must be locked before use.
      setInitInfo(carried)
      navigate(Pages.InitBiometric)
    } else {
      // Second run, after biometrics or a password was set — go to the wallet
      setInitInfo({})
      navigate(Pages.Wallet)
    }
  }, [connectDone])

  const abortConnectionWithError = (err: any) => {
    consoleError(err, 'Error during connection:')
    setLoadingStatus(t('init.connection.connectionFailed'))
    setError(t('init.connection.connectionFailed'))
    setConnectDone(true)
  }

  return (
    <>
      <Header text={t('init.connection.serverConnection')} />
      <Content>
        <Loading text={loadingStatus || t('init.connection.serverConnection')} />
      </Content>
    </>
  )
}
