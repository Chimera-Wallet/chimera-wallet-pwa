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

  useEffect(() => {
    if (!password || (!mnemonic && !privateKey)) {
      abortConnectionWithError(new Error('Missing credentials'))
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
    setLoadingStatus('Restoring swaps...')
    restoreSwaps()
      .then((count) => count && consoleLog(`Restored ${count} swaps from network`))
      .catch((err) => consoleError(err, 'Error restoring swaps:'))
      .finally(() => setConnectDone(true))
  }, [arkadeSwaps, initialized, initInfo.restoring])

  useEffect(() => {
    if (!connectDone) return
    if (error) {
      setInitInfo({ restoring: initInfo.restoring })
      navigate(Pages.Init)
    } else if (!initInfo.backupDone && !initInfo.restoring) {
      // First run for a new wallet — show success/backup screens
      setInitInfo({ restoring: false, mnemonic: mnemonic ?? undefined, privateKey: mnemonic ? undefined : privateKey })
      navigate(Pages.InitSuccess)
    } else {
      // Second run (after password/biometrics) or restore — go straight to wallet
      setInitInfo({})
      navigate(Pages.Wallet)
    }
  }, [connectDone])

  const abortConnectionWithError = (err: any) => {
    consoleError(err, 'Error during connection:')
    setLoadingStatus('Connection failed')
    setError('Connection failed')
    setConnectDone(true)
  }

  return (
    <>
      <Header text='Connecting to server' />
      <Content>
        <Loading text={loadingStatus || 'Connecting to server'} />
      </Content>
    </>
  )
}
