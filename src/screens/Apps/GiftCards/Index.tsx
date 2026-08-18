import { useContext } from 'react'
import { NavigationContext, Pages } from '../../../providers/navigation'
import Header from '../../../components/Header'
import Content from '../../../components/Content'
import Padded from '../../../components/Padded'
import FlexCol from '../../../components/FlexCol'
import Button from '../../../components/Button'
import {useTranslation} from 'react-i18next'


export default function AppGiftCards() {
  const { navigate } = useContext(NavigationContext)

  const handleBack = () => navigate(Pages.Apps)

  const  {t} = useTranslation()

  return (
    <>
      <Header text={t('apps.giftCards.giftCards')} back={handleBack} />
      <Content>
        <Padded>
          <FlexCol>
            <Button label={t('apps.giftCards.buy')} onClick={() => navigate(Pages.AppGiftCardPurchase)} />
            <Button label={t('apps.giftCards.redeem')} onClick={() => navigate(Pages.AppGiftCardRedeem)} />
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
