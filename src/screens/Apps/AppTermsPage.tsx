import { useState } from 'react'
import Content from '../../components/Content'
import FlexCol from '../../components/FlexCol'
import Header from '../../components/Header'
import Padded from '../../components/Padded'
import Text from '../../components/Text'
import Button from '../../components/Button'
import Checkbox from '../../components/Checkbox'
import type { AppTerms } from '../../lib/appConfig'

interface AppTermsPageProps {
  appName: string
  terms: AppTerms
  onAccept: () => void
  onBack: () => void
}

export default function AppTermsPage({ appName, terms, onAccept, onBack }: AppTermsPageProps) {
  const [accepted, setAccepted] = useState(false)

  const handleToggle = () => {
    setAccepted((prev) => !prev)
  }

  return (
    <>
      <Header text={terms.title} back={onBack} />
      <Content>
        <Padded>
          <div
            style={{
              height: '100%',
              minHeight: '400px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '1.5rem',
            }}
          >
            <FlexCol gap='1rem'>
              <Text bold large>
                {appName}
              </Text>

              <div
                style={{
                  maxHeight: '300px',
                  overflowY: 'auto',
                  padding: '1rem',
                  backgroundColor: 'var(--dark05)',
                  borderRadius: '8px',
                  border: '1px solid var(--dark10)',
                }}
              >
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  <Text wrap>{terms.content}</Text>
                </div>
              </div>
            </FlexCol>

            <FlexCol gap='1rem'>
              <Checkbox onChange={handleToggle} text={terms.checkboxLabel} />

              <Button onClick={onAccept} label='Continue' disabled={!accepted} />
            </FlexCol>
          </div>
        </Padded>
      </Content>
    </>
  )
}
