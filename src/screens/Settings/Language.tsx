import Header from './Header'
import Content from '../../components/Content'
import Padded from '../../components/Padded'
import Text from '../../components/Text'
import FlexCol from '../../components/FlexCol'

export default function Language() {
  return (
    <>
      <Header text='App Language' back />
      <Content>
        <Padded>
          <FlexCol centered gap='2rem'>
            <Text large bold centered>
              Coming Soon
            </Text>
            <Text centered thin>
              Multi-language support will be available in a future update.
            </Text>
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
