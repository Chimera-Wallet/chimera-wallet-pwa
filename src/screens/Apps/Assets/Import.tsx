import { useContext, useState } from 'react'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import Content from '../../../components/Content'
import ErrorMessage from '../../../components/Error'
import FlexCol from '../../../components/FlexCol'
import Header from '../../../components/Header'
import LoadingLogo from '../../../components/LoadingLogo'
import Padded from '../../../components/Padded'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { ConfigContext } from '../../../providers/config'
import { FlowContext } from '../../../providers/flow'
import { WalletContext } from '../../../providers/wallet'
import { consoleError } from '../../../lib/logs'
import { extractError } from '../../../lib/error'
import InputAssetId from '../../../components/InputAssetId'
import Scanner from '../../../components/Scanner'
import { isValidAssetId } from '../../../lib/assets'
import {useTranslation} from 'react-i18next'

export default function AppAssetImport() {
  const { navigate } = useContext(NavigationContext)
  const { config, updateConfig } = useContext(ConfigContext)
  const { setAssetInfo } = useContext(FlowContext)
  const { svcWallet, setCacheEntry } = useContext(WalletContext)

  const [assetId, setAssetId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [scan, setScan] = useState(false)

  const {t} = useTranslation()

  const handleImport = async () => {
    if (!svcWallet) return
    if (!isValidAssetId(assetId)) {
      setError(t('errors.assets.idHex'))
      return
    }

    setLoading(true)
    setError('')

    try {
      const details = await svcWallet.assetManager.getAssetDetails(assetId)
      if (!details) throw new Error(t('errors.assets.assNF'))

      const moderated = setCacheEntry(assetId, details)

      // Add to imported assets if not already there
      if (!config.importedAssets.includes(assetId)) {
        updateConfig({ ...config, importedAssets: [...config.importedAssets, assetId] })
      }

      setAssetInfo(moderated)
      navigate(Pages.AppAssetDetail)
    } catch (err) {
      consoleError(err, 'error importing asset')
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <LoadingLogo text={t('apps.assets.fetchingAssDet')}/>

  if (scan) return <Scanner close={() => setScan(false)} label={t('apps.assets.arkNotez')} onData={setAssetId} onError={setError} />

  return (
    <>
      <Header text={t('apps.assets.impAss')} back={() => navigate(Pages.AppAssets)} />
      <Content>
        <Padded>
          <FlexCol>
            <ErrorMessage error={Boolean(error)} text={error} />
            <InputAssetId
              name='asset-id'
              focus
              label={t('apps.assets.assId')}
              onChange={setAssetId}
              onEnter={handleImport}
              openScan={() => setScan(true)}
              value={assetId}
            />
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button label={t('apps.assets.import')} onClick={handleImport} disabled={!assetId} />
      </ButtonsOnBottom>
    </>
  )
}
