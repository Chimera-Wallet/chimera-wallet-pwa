import { useContext } from 'react'
import Header from '../../components/Header'
import Content from '../../components/Content'
import Padded from '../../components/Padded'
import FlexCol from '../../components/FlexCol'
import Button from '../../components/Button'
import ButtonsOnBottom from '../../components/ButtonsOnBottom'
import { NavigationContext, Pages } from '../../providers/navigation'

export default function InitBackupWarning() {
  const { navigate, goBack } = useContext(NavigationContext)

  const handleProceed = () => {
    navigate(Pages.InitBiometric)
  }

  const handleGoBack = () => {
    goBack()
  }

  return (
    <>
      <Header text='Important Warning' />
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
                ⚠ WARNING
              </p>
              <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.6 }}>
                If you deposit funds to your wallet <strong>without backing up your keys</strong> you are at constant
                risk of <strong style={{ color: 'rgb(220, 38, 38)' }}>TOTAL AND IRREVERSIBLE loss of funds</strong>.
              </p>
              <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.6 }}>
                Chimera Wallet is a <strong>fully non-custodial wallet</strong>. <strong>NO ONE</strong> can help you
                recover your funds if you don't have your key.
              </p>
            </div>
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button onClick={handleProceed} label='I understand, proceed' />
        <Button onClick={handleGoBack} label='Go back' secondary clear />
      </ButtonsOnBottom>
    </>
  )
}
