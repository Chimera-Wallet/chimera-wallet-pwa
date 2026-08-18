import { useContext } from 'react'
import Button from '../../components/Button'
import { FlowContext } from '../../providers/flow'
import { NavigationContext, Pages } from '../../providers/navigation'
import {useTranslation} from 'react-i18next'

export default function InitSuccess() {
  const { initInfo } = useContext(FlowContext)
  const { navigate } = useContext(NavigationContext)

  const {t} = useTranslation()

  const isRestoring = initInfo.restoring
  const headline = isRestoring ? t('init.success.walletRestore') : t('init.success.liveWallet')
  const text = isRestoring
    ? t('init.success.walletRestoreSucc')
    : t('init.success.walletCreatedSucc')

  const handleGoToWallet = () => {
    navigate(isRestoring ? Pages.Wallet : Pages.InitBackupKey)
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '100dvh', overflow: 'hidden' }}>
      {/* Splash background — same as Init */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(31, 59, 219, 1) 0%, rgba(3, 14, 78, 1) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 'calc(2.5rem + env(safe-area-inset-top))',
          paddingBottom: 'calc(2.5rem + env(safe-area-inset-bottom))',
          opacity: 0.35,
          pointerEvents: 'none',
        }}
      >
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src='/images/chimera_coins.png' alt='' style={{ width: '280px', maxWidth: '80%', objectFit: 'contain' }} />
        </div>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 1.5rem' }}>
          <img src='/images/chimera_white_logo.png' alt='Chimera' style={{ width: '160px', maxWidth: '60%', objectFit: 'contain', marginBottom: '0.75rem' }} />
          <p style={{ color: 'white', fontFamily: 'Titillium Web', fontSize: '14px', fontWeight: 600, letterSpacing: '1px', textAlign: 'center', margin: '0 0 2rem' }}>
            {t('init.success.takeControl')}
          </p>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ height: 52, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)' }} />
            <div style={{ height: 52, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.1)' }} />
          </div>
        </div>
      </div>

      {/* Dark overlay */}
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.55)' }} />

      {/* Modal card */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
        }}
      >
        <div
          style={{
            backgroundColor: 'var(--background-color)',
            borderRadius: '1rem',
            padding: '1.75rem 1.5rem',
            width: '100%',
            maxWidth: '22rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--fg)', textAlign: 'center' }}>
              {headline}
            </p>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--neutral-600)', lineHeight: 1.5, textAlign: 'center' }}>
              {text}
            </p>
          </div>
          <Button label={t('init.success.goWallet')} onClick={handleGoToWallet} />
        </div>
      </div>
    </div>
  )
}
