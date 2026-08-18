import Header from './Header'
import Content from '../../components/Content'
import Padded from '../../components/Padded'
import Text from '../../components/Text'
import FlexCol from '../../components/FlexCol'
import {useTranslation} from 'react-i18next'

export default function Language() {
  const {t} = useTranslation()
  return (
    <>
      <Header text={t('settings.language.appLang')} back />
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
