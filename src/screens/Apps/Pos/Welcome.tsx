import { ReactNode } from 'react'
import { Clock, Coins, RefreshCw, ShieldCheck, UserCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import Content from '../../../components/Content'
import Header from '../../../components/Header'
import Padded from '../../../components/Padded'
import { getBankTransferConfigSync } from '../../../lib/bankTransferConfig'

function Feature({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div
      style={{
        alignItems: 'center',
        backgroundColor: 'var(--blue-dark)',
        borderRadius: 14,
        color: '#fff',
        display: 'flex',
        gap: '1rem',
        padding: '1rem 1.25rem',
      }}
    >
      <span style={{ display: 'flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ fontWeight: 600, letterSpacing: '0.04em', lineHeight: 1.25 }}>{text}</span>
    </div>
  )
}

interface PosWelcomeProps {
  onBack: () => void
  onContinue: () => void
}

export default function PosWelcome({ onBack, onContinue }: PosWelcomeProps) {
  const { t } = useTranslation()
  const limit = getBankTransferConfigSync().kycThreshold.toLocaleString()

  return (
    <>
      <Header text={t('apps.pos.title')} back={onBack} />
      <Content>
        <Padded>
          <div
            data-testid='pos-welcome'
            style={{
              background: 'linear-gradient(180deg, var(--blue-primary) 0%, var(--blue-medium) 60%, var(--blue-dark) 100%)',
              borderRadius: 20,
              color: '#fff',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.625rem',
              padding: '1.5rem 1.25rem',
            }}
          >
            <div style={{ marginBottom: '0.75rem' }}>
              <p style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>{t('apps.pos.title')}</p>
              <p style={{ fontSize: '0.875rem', margin: '0.25rem 0 0', opacity: 0.9 }}>{t('apps.pos.welcome.intro')}</p>
            </div>
            <Feature icon={<Clock size={22} />} text={t('apps.pos.welcome.noWait')} />
            <Feature icon={<ShieldCheck size={22} />} text={t('apps.pos.welcome.noVerification')} />
            <Feature icon={<UserCheck size={22} />} text={t('apps.pos.welcome.noPersonal')} />
            <Feature icon={<RefreshCw size={22} />} text={t('apps.pos.welcome.conversion', { limit })} />
            <Feature icon={<Coins size={22} />} text={t('apps.pos.welcome.zeroFees')} />
          </div>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button label={t('apps.pos.welcome.getStarted')} onClick={onContinue} testId='pos-get-started' />
      </ButtonsOnBottom>
    </>
  )
}
