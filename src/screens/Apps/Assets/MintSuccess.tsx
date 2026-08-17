import { useContext } from 'react'
import Header from '../../../components/Header'
import Content from '../../../components/Content'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import FlexCol from '../../../components/FlexCol'
import Padded from '../../../components/Padded'
import Text, { TextSecondary } from '../../../components/Text'
import SuccessIcon from '../../../icons/Success'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { FlowContext } from '../../../providers/flow'
import { WalletContext } from '../../../providers/wallet'
import AssetCard from '../../../components/AssetCard'
import {useTranslation} from 'react-i18next'

export default function AppAssetMintSuccess() {
  const { navigate } = useContext(NavigationContext)
  const { assetInfo } = useContext(FlowContext)
  const { assetMetadataCache } = useContext(WalletContext)

  const {t} = useTranslation()

  const fromCache = assetMetadataCache.get(assetInfo.assetId)
  const details = fromCache ?? assetInfo
  const name = details.metadata?.name ?? t('common.generla.unkown')
  const ticker = details.metadata?.ticker ?? ''
  const decimals = details.metadata?.decimals ?? 8
  const icon = details.metadata?.icon

  const handleViewAsset = () => {
    navigate(Pages.AppAssetDetail)
  }

  return (
    <>
      <Header text={t('apps.assets.assetCreate')} />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem' centered padding='1rem 0 0 0'>
            <SuccessIcon small />
            <Text centered big bold>
             {t('apps.assets.assMint')}
            </Text>
            <AssetCard
              assetId={assetInfo.assetId}
              balance={details.supply}
              decimals={decimals}
              icon={icon}
              name={name}
              ticker={ticker}
              darkPurple
            />
            <FlexCol gap='0.25rem' centered>
              <Text copy={assetInfo.assetId} color='neutral-500' smaller>
                {assetInfo.assetId.slice(0, 12)}...{assetInfo.assetId.slice(-12)}
              </Text>
              <TextSecondary centered>{t('apps.assets.assID')}</TextSecondary>
            </FlexCol>
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button label={t('apps.assets.viewAss')} onClick={handleViewAsset} />
        <Button label={t('apps.assets.backArkMint')} onClick={() => navigate(Pages.AppAssets)} secondary />
      </ButtonsOnBottom>
    </>
  )
}
