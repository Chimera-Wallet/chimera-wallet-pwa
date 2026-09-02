import { useContext, useEffect, useState } from 'react'
import Button from '../../components/Button'
import ButtonsOnBottom from '../../components/ButtonsOnBottom'
import Content from '../../components/Content'
import Padded from '../../components/Padded'
import ErrorMessage from '../../components/Error'
import { ConfigContext } from '../../providers/config'
import { getAspInfo } from '../../lib/asp'
import { WalletContext } from '../../providers/wallet'
import Header from './Header'
import WarningBox from '../../components/Warning'
import InputUrl from '../../components/InputUrl'
import FlexCol from '../../components/FlexCol'
import Scanner from '../../components/Scanner'
import { AspContext, AspInfo } from '../../providers/asp'
import { consoleError } from '../../lib/logs'
import LoadingLogo from '../../components/LoadingLogo'
import {useTranslation} from 'react-i18next'

export default function Server() {
  const { aspInfo } = useContext(AspContext)
  const { backupConfig, config, updateConfig } = useContext(ConfigContext)
  const { svcWallet, resetWallet } = useContext(WalletContext)

  const {t} = useTranslation()

  const [aspUrl, setAspUrl] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState<AspInfo>()
  const [scan, setScan] = useState(false)
  const [loading, setLoading] = useState(false)

  const isValidUrl = (url: string) => {
    if (url.startsWith('localhost') || url.startsWith('http://localhost')) return true
    if (url.startsWith('127.0.0.1') || url.startsWith('http://127.0.0.1')) return true
    const urlPattern = /^(https?:\/\/)?([\w-]+(\.[\w-]+)+)([\w.,@?^=%&:/~+#-]*[\w@?^=%&/~+#-])?$/
    return urlPattern.test(url)
  }

  useEffect(() => {
    setError(aspInfo.unreachable ? t('errors.send.arkade.server') : '')
  }, [aspInfo.unreachable])

  useEffect(() => {
    if (!aspUrl || !isValidUrl(aspUrl)) return
    // don't do anything if same server
    if (aspUrl === config.aspUrl) return setError(t('errors.server.same'))
    // test connection
    getAspInfo(aspUrl).then((info) => {
      setError(info.unreachable ? t('errors.server.unableConnect') : '')
      setInfo(info)
    })
  }, [aspUrl])

  if (!svcWallet) return <LoadingLogo text={t('common.general.loading')} />

  const handleConnect = async () => {
    setLoading(true)
    try {
      if (!info) return
      await resetWallet()
      const newConfig = { ...config, aspUrl: info.url }
      if (config.nostrBackup) await backupConfig(newConfig)
      updateConfig(newConfig)
      location.reload() // reload app or else weird things happen
    } catch (err) {
      consoleError(err)
    } finally {
      setLoading(false)
    }
  }

  const handleEnter = () => {
    if (!info || Boolean(error)) return
    handleConnect()
  }

  if (scan) return <Scanner close={() => setScan(false)} label={t('settings.server.serverURL')} onData={setAspUrl} onError={setError} />

  return (
    <>
      <Header text={t('settings.server.server')} back />
      <Content>
        <Padded>
          <FlexCol>
            <InputUrl
              focus
              label={t('settings.server.serverURL')}
              onChange={setAspUrl}
              onEnter={handleEnter}
              openScan={() => setScan(true)}
              placeholder={config.aspUrl}
              value={aspUrl}
            />
            <ErrorMessage error={Boolean(error)} text={error} />
            {info && !error ? <WarningBox green text={t('settings.server.found')} /> : null}
            <WarningBox text={t('settings.server.walletReset')} />
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button
          onClick={handleConnect}
          label={t('settings.server.connect')}
          disabled={!info || Boolean(error)}
          loading={loading}
        />
      </ButtonsOnBottom>
    </>
  )
}
