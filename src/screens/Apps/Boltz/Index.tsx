import { useContext } from 'react'
import Shadow from '../../../components/Shadow'
import Padded from '../../../components/Padded'
import Header from '../../../components/Header'
import Content from '../../../components/Content'
import FlexCol from '../../../components/FlexCol'
import FlexRow from '../../../components/FlexRow'
import SwapsList from '../../../components/SwapsList'
import Text, { TextLabel } from '../../../components/Text'
import { SettingsIconLight } from '../../../icons/Settings'
import { SwapsContext } from '../../../providers/swaps'
import { GreenStatusIcon, RedStatusIcon } from '../../../icons/Status'
import { NavigationContext, Pages } from '../../../providers/navigation'
import {useTranslation} from 'react-i18next'

export default function AppBoltz() {
  const { connected, getApiUrl } = useContext(SwapsContext)
  const { navigate } = useContext(NavigationContext)
  const {t} = useTranslation()

  const ConnectionStatus = () => (
    <FlexRow end>{connected ? <GreenStatusIcon small /> : <RedStatusIcon small />}</FlexRow>
  )

  return (
    <>
      <Header auxFunc={() => navigate(Pages.AppBoltzSettings)} auxIcon={<SettingsIconLight />} text={t('apps.boltz.boltz')} back />
      <Content>
        <Padded>
          <FlexCol gap='2rem'>
            <FlexCol gap='0'>
              <TextLabel>{t('apps.boltz.connStatus')}</TextLabel>
              <Shadow fat>
                <FlexRow between>
                  <Text>{getApiUrl() ?? t('apps.boltz.noServ')}</Text>
                  <ConnectionStatus />
                </FlexRow>
              </Shadow>
            </FlexCol>
            <SwapsList />
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
