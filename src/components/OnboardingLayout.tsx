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
    // Fill the page area (PageTransition is position:absolute/inset:0, so this
    // resolves to the visible viewport) and lay out as a flex column. We must
    // NOT use `minHeight: 100vh`: on iOS 100vh excludes the browser chrome /
    // home-indicator area, which makes the container taller than the visible
    // screen and pushes the bottom buttons off-screen. Safe-area insets are
    // handled with padding so the buttons sit above the home indicator.
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflowY: 'auto',
        background: 'linear-gradient(180deg, rgba(31, 59, 219, 1) 0%, rgba(3, 14, 78, 1) 100%)',
        paddingTop: 'calc(2.5rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(2.5rem + env(safe-area-inset-bottom))',
      }}
    >
      {/* Coins image — top, fills upper portion (can shrink on short screens) */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src='/images/chimera_coins.png' alt='' style={{ width: '280px', maxWidth: '80%', objectFit: 'contain' }} />
      </div>

      {/* Logo + tagline + content — lower portion */}
      <div
        style={{
          width: '100%',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '0 1.5rem',
          boxSizing: 'border-box',
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
  )
}
