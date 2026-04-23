import { useContext } from 'react'
import { NavigationContext, Pages } from '../../../providers/navigation'
import CenterScreen from '../../../components/CenterScreen'
import Text from '../../../components/Text'
import Content from '../../../components/Content'
import Padded from '../../../components/Padded'
import Header from '../../../components/Header'

export default function AppSwap() {
  const { navigate } = useContext(NavigationContext)

  const handleBack = () => {
    navigate(Pages.Apps)
  }

  return (
    <>
      <Header text='Swap' />
      <Content>
        <Padded>
          <CenterScreen>
            <Text heading>Coming Soon</Text>
          </CenterScreen>
        </Padded>
      </Content>
    </>
  )
}
