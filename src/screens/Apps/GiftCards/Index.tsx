import { useContext } from 'react'
import { NavigationContext, Pages } from '../../../providers/navigation'
import Header from '../../../components/Header'
import Content from '../../../components/Content'
import Padded from '../../../components/Padded'
import FlexCol from '../../../components/FlexCol'
import Button from '../../../components/Button'

export default function AppGiftCards() {
  const { navigate } = useContext(NavigationContext)

  const handleBack = () => navigate(Pages.Apps)

  return (
    <>
      <Header text='Gift Cards' back={handleBack} />
      <Content>
        <Padded>
          <FlexCol>
            <Button label='Buy a new gift card' onClick={() => navigate(Pages.AppGiftCardPurchase)} />
            <Button label='Redeem gift card' onClick={() => navigate(Pages.AppGiftCardRedeem)} />
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
