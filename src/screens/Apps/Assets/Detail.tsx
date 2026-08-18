import { useContext, useEffect, useState } from 'react'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import Content from '../../../components/Content'
import FlexCol from '../../../components/FlexCol'
import FlexRow from '../../../components/FlexRow'
import Header from '../../../components/Header'
import LoadingLogo from '../../../components/LoadingLogo'
import Padded from '../../../components/Padded'
import Shadow from '../../../components/Shadow'
import Text, { TextSecondary } from '../../../components/Text'
import AssetAvatar from '../../../components/AssetAvatar'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { ConfigContext } from '../../../providers/config'
import { FlowContext, emptyRecvInfo, emptySendInfo } from '../../../providers/flow'
import { WalletContext } from '../../../providers/wallet'
import { consoleError } from '../../../lib/logs'
import type { AssetDetails } from '@arkade-os/sdk'
import { prettyAssetAmount } from '../../../lib/assets'
import {useTranslation} from 'react-i18next'

export default function AppAssetDetail() {
  const { navigate } = useContext(NavigationContext)
  const { config, updateConfig } = useContext(ConfigContext)
  const { assetInfo, setAssetInfo, setRecvInfo, setSendInfo } = useContext(FlowContext)
  const { assetBalances, svcWallet, assetMetadataCache, setCacheEntry, iconApprovalManager } = useContext(WalletContext)

  const {t} = useTranslation()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const cachedEntry = assetMetadataCache.get(assetInfo.assetId)
  const hasIcon = cachedEntry?.hasIcon ?? false

  const balance = assetBalances.find((a) => a.assetId === assetInfo.assetId)?.amount ?? BigInt(0)

  const fetchDetails = async (forceRefresh = false) => {
    if (!svcWallet || !assetInfo.assetId) return

    let cached: AssetDetails | undefined = forceRefresh ? undefined : assetMetadataCache.get(assetInfo.assetId)
    if (!cached) {
      try {
        const fetched = await svcWallet.assetManager.getAssetDetails(assetInfo.assetId)
        if (fetched) {
          cached = setCacheEntry(assetInfo.assetId, fetched)
        }
      } catch (err) {
        consoleError(err, 'error loading asset details')
      }
    }

    if (!cached) return
    setAssetInfo(cached)
  }

  useEffect(() => {
    fetchDetails().then(() => setLoading(false))
  }, [svcWallet, assetInfo.assetId])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchDetails(true)
    setRefreshing(false)
  }

  if (loading) return <LoadingLogo text={t('apps.assets.loadingAss')} />

  const meta = assetInfo.metadata
  const name = meta?.name ?? t('apps.assets.unkownAss')
  const ticker = meta?.ticker ?? ''
  const decimals = meta?.decimals ?? 8
  const supply = assetInfo.supply
  const controlAssetId = assetInfo.controlAssetId
  const truncateId = (id: string) => `${id.slice(0, 12)}...${id.slice(-12)}`

  // Check if user holds control asset
  const holdsControlAsset = controlAssetId
    ? assetBalances.some((a) => a.assetId === controlAssetId && a.amount > 0)
    : false

  const isImported = config.importedAssets.includes(assetInfo.assetId)
  const canRemove = isImported && balance === BigInt(0)

  const handleSend = () => {
    setSendInfo({ ...emptySendInfo, assets: [{ assetId: assetInfo.assetId, amount: BigInt(0) }] })
    navigate(Pages.SendForm)
  }

  const handleReceive = () => {
    setRecvInfo({ ...emptyRecvInfo, assetId: assetInfo.assetId })
    navigate(Pages.ReceiveQRCode)
  }

  const handleReissue = () => {
    navigate(Pages.AppAssetReissue)
  }

  const handleBurn = () => {
    navigate(Pages.AppAssetBurn)
  }

  const handleRemove = () => {
    const updated = config.importedAssets.filter((id) => id !== assetInfo.assetId)
    updateConfig({ ...config, importedAssets: updated })
    navigate(Pages.AppAssets)
  }

  return (
    <>
      <Header text={name} back={() => navigate(Pages.AppAssets)} />
      <Content>
        <Padded>
          <FlexCol gap='1rem' centered>
            <AssetAvatar icon={meta?.icon} ticker={ticker} name={name} size={64} />

            <FlexCol gap='0.25rem' centered>
              <Text bigger bold centered>
                {prettyAssetAmount(balance, decimals)} {ticker}
              </Text>
              <TextSecondary centered>{name}</TextSecondary>
            </FlexCol>

            <FlexCol gap='0.25rem' centered>
              <Text copy={assetInfo.assetId} color='neutral-500' smaller centered>
                {truncateId(assetInfo.assetId)}
              </Text>
              <FlexRow gap='0.25rem' centered>
                <TextSecondary centered>{t('apps.assets.assID')}</TextSecondary>
                <span
                  onClick={handleRefresh}
                  style={{
                    cursor: 'pointer',
                    fontSize: 13,
                    color: 'var(--neutral-500)',
                    opacity: refreshing ? 0.5 : 1,
                    transition: 'opacity 0.2s',
                  }}
                >
                  {refreshing ? '...' : '\u21BB'}
                </span>
              </FlexRow>
            </FlexCol>

            <Shadow lighter>
              <FlexCol gap='0.5rem' padding='0.75rem'>
                {name !== 'Unknown Asset' ? (
                  <FlexRow between>
                    <TextSecondary>{t('common.general.name')}</TextSecondary>
                    <Text bold>{name}</Text>
                  </FlexRow>
                ) : null}
                {ticker ? (
                  <FlexRow between>
                    <TextSecondary>{t('apps.assets.ticker')}</TextSecondary>
                    <Text bold>{ticker}</Text>
                  </FlexRow>
                ) : null}
                <FlexRow between>
                  <TextSecondary>{t('apps.assets.supply')}</TextSecondary>
                  <Text bold>{prettyAssetAmount(supply, decimals) ?? t('common.general.unkown')}</Text>
                </FlexRow>
                <FlexRow between>
                  <TextSecondary>{t('apps.assets.decimals')}</TextSecondary>
                  <Text bold>{decimals}</Text>
                </FlexRow>
                {controlAssetId ? (
                  <FlexRow between>
                    <TextSecondary>{t('apps.assets.control')}</TextSecondary>
                    <FlexRow gap='0.25rem' end>
                      {(() => {
                        const ctrl = assetMetadataCache.get(controlAssetId)?.metadata
                        const ctrlName = ctrl?.name ?? `${controlAssetId.slice(0, 8)}...${controlAssetId.slice(-8)}`
                        const label = ctrl?.ticker ? `${ctrlName} (${ctrl.ticker})` : ctrlName
                        return (
                          <>
                            <AssetAvatar
                              icon={ctrl?.icon}
                              ticker={ctrl?.ticker}
                              size={20}
                              assetId={controlAssetId}
                              clickable
                            />
                            <Text bold copy={controlAssetId}>
                              {label}
                            </Text>
                          </>
                        )
                      })()}
                    </FlexRow>
                  </FlexRow>
                ) : null}
              </FlexCol>
            </Shadow>
            {hasIcon && !iconApprovalManager.isVerified(assetInfo.assetId) ? (
              <Button
                label={iconApprovalManager.isApproved(assetInfo.assetId) ? t('apps.assets.hideIc') : t('apps.assets.showIc')}
                onClick={async () => {
                  if (iconApprovalManager.isApproved(assetInfo.assetId)) {
                    iconApprovalManager.revoke(assetInfo.assetId)
                  } else {
                    iconApprovalManager.approve(assetInfo.assetId)
                  }
                  await fetchDetails(true)
                }}
                secondary
              />
            ) : null}
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <FlexRow gap='0.75rem'>
          <Button label={t('general.common.send')} onClick={handleSend} disabled={balance === BigInt(0)} />
          <Button label={t('general.common.receive')} onClick={handleReceive} />
        </FlexRow>
        <FlexRow gap='0.75rem'>
          <Button label={t('general.common.reissue')} onClick={handleReissue} secondary disabled={!holdsControlAsset} />
          {balance > 0 ? <Button label={t('general.common.burn')} onClick={handleBurn} secondary /> : null}
        </FlexRow>
        {canRemove ? <Button label={t('general.common.remove')} onClick={handleRemove} secondary /> : null}
      </ButtonsOnBottom>
    </>
  )
}
