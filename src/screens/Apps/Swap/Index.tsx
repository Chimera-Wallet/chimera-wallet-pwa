import { useContext } from 'react'
import { NavigationContext, Pages } from '../../../providers/navigation'
import CenterScreen from '../../../components/CenterScreen'
import Text from '../../../components/Text'
import Content from '../../../components/Content'
import Padded from '../../../components/Padded'
import Header from '../../../components/Header'
import {useTranslation} from 'react-i18next'

export default function AppSwap() {
  const { navigate } = useContext(NavigationContext)
  const {t} = useTranslation()

  const handleBack = () => {
    navigate(Pages.Apps)
  }

  return (
    <>
      <Header text={t('apps.swap.swap')} />
      <Content>
        <Padded>
          <CenterScreen>
            <Text heading>{t('apps.swap.coming')}</Text>
          </CenterScreen>
        </Padded>
      </Content>
    </>
  )
}
