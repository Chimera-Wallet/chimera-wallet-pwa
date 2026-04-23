import Content from '../../components/Content'
import FlexCol from '../../components/FlexCol'
import Header from '../../components/Header'
import Padded from '../../components/Padded'
import Text from '../../components/Text'

interface AppWebViewProps {
  appName: string
  url: string
  onBack: () => void
}

export default function AppWebView({ appName, url, onBack }: AppWebViewProps) {
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
              <Text centered>This app is not yet available.</Text>
              <Text small centered>
                Please check back later.
              </Text>
            </div>
          </Padded>
        </Content>
      </>
    )
  }

  return (
    <>
      <Header text={appName} back={onBack} />
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
