import { useContext } from 'react'
import Header from '../../components/Header'
import Content from '../../components/Content'
import Padded from '../../components/Padded'
import FlexCol from '../../components/FlexCol'
import Button from '../../components/Button'
import ButtonsOnBottom from '../../components/ButtonsOnBottom'
import { NavigationContext, Pages } from '../../providers/navigation'
import { useTranslation, Trans } from 'react-i18next';

export default function InitBackupWarning() {
  const { navigate, goBack } = useContext(NavigationContext)

  const handleProceed = () => {
    navigate(Pages.InitBiometric)
  }

  const handleGoBack = () => {
    goBack()
  }

  const {t} = useTranslation()

  return (
    <>
      <Header text={t('important')} />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
            <div
              style={{
                background: 'rgba(220, 38, 38, 0.1)',
                border: '2px solid rgb(220, 38, 38)',
                borderRadius: '12px',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                
              }}
            >
              <p
                style={{
                  color: 'rgb(220, 38, 38)',
                  fontSize: '1.5rem',
                  fontWeight: 800,
                  margin: 0,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {t('warning')}
              </p>
              <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.6 }}>
               <Trans
                i18nKey="init.warning.lossFunds"
                components={{
                  bold: <strong />,
                  danger: <strong style={{ color: 'rgb(220, 38, 38)' }} />,
                }}
              />
              </p>
              <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.6 }}>
                <Trans
                  i18nKey="init.warning.nonCustodial"
                  components={{
                    bold: <strong />,
                    strongWarning: <strong />,
                  }}
                />
              </p>
            </div>
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button onClick={handleProceed} label={t('init.warning.understood')} />
        <Button onClick={handleGoBack} label={t('init.warning.goBack')} secondary clear />
      </ButtonsOnBottom>
    </>
  )
}
