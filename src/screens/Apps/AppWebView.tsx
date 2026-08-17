import { T } from 'vitest/dist/chunks/reporters.d.BuRON0I0.js'
import Content from '../../components/Content'
import FlexCol from '../../components/FlexCol'
import Header from '../../components/Header'
import Padded from '../../components/Padded'
import Text from '../../components/Text'
import {useTranslation} from 'react-i18next'

interface AppWebViewProps {
  appName: string
  url: string
  onBack: () => void
}

export default function AppWebView({ appName, url, onBack }: AppWebViewProps) {
  const {t} = useTranslation()
  if (!url) {
    return (
      <>
        <Header text={appName} back={onBack} />
        <Content>
          <Padded>
            <div
              style={{
                height: '100%',
                minHeight: '300px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1rem',
              }}
            >
              <Text centered>{t('common.general.unavailableApp')}.</Text>
              <Text small centered>
                {t('common.general.checkBack')}
              </Text>
            </div>
          </Padded>
        </Content>
      </>
    )
  }

  return (
    <>
      <Header text={appName} />
      <Content>
        <Padded>
          <FlexCol gap='0'>
            <iframe
              src={url}
              title={appName}
              allow='clipboard-write; clipboard-read'
              style={{
                width: '100%',
                height: 'calc(100vh - 150px)',
                border: 'none',
                borderRadius: '8px',
              }}
            />
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
