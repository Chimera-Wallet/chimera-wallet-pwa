import { ReactNode } from 'react'

interface OnboardingLayoutProps {
  children: ReactNode
}

// Full-screen onboarding visual: blue gradient background, coins artwork at the
// top, then the Chimera logo + tagline above whatever content (buttons, inputs)
// is passed as children. Shared by the Init landing screen and the Unlock
// screen so they stay visually identical.
export default function OnboardingLayout({ children }: OnboardingLayoutProps) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '100vh' }}>
      {/* Full-screen gradient background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(31, 59, 219, 1) 0%, rgba(3, 14, 78, 1) 100%)',
          zIndex: 0,
        }}
      />

      {/* Full-screen layout */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 'calc(2.5rem + env(safe-area-inset-top))',
          paddingBottom: 'calc(2.5rem + env(safe-area-inset-bottom))',
        }}
      >
        {/* Coins image — top, fills upper portion */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src='/images/chimera_coins.png' alt='' style={{ width: '280px', maxWidth: '80%', objectFit: 'contain' }} />
        </div>

        {/* Logo + tagline + content — lower portion */}
        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '0 1.5rem',
          }}
        >
          <img
            src='/images/chimera_white_logo.png'
            alt='Chimera'
            style={{ width: '160px', maxWidth: '60%', objectFit: 'contain', marginBottom: '0.75rem' }}
          />

          <p
            style={{
              color: 'rgba(255, 255, 255, 1)',
              fontFamily: 'Titillium Web',
              fontSize: '14px',
              fontWeight: 600,
              letterSpacing: '1px',
              textAlign: 'center',
              margin: '0 0 2rem',
              textTransform: 'none',
            }}
          >
            Take back control of your money
          </p>

          <div style={{ width: '100%' }}>{children}</div>
        </div>
      </div>
    </div>
  )
}
