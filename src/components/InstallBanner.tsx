import React from 'react'
import Button from './Button'
import HomeIcon from '../icons/Home'
import { hapticSubtle } from '../lib/haptics'

const FONT = "'Titillium Web', sans-serif"

const wrapperStyle: React.CSSProperties = {
  position: 'relative',
  overflow: 'visible',
  width: '100%',
  height: '100%',
}

const cardStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: '20px 16px 16px 16px',
  width: '100%',
  height: '100%',
  borderRadius: 20,
  backgroundColor: 'var(--neutral-100)',
  boxShadow: '0 20px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
  boxSizing: 'border-box',
  fontFamily: FONT,
}

const iconStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: '50%',
  backgroundColor: '#000',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

const dismissStyle: React.CSSProperties = {
  position: 'absolute',
  top: 14,
  right: 14,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 6,
  lineHeight: 0,
  color: 'var(--neutral-500)',
  touchAction: 'manipulation',
}

interface InstallBannerProps {
  description: string
  action?: { label: string; onClick: () => void }
  onDismiss: () => void
}

export default function InstallBanner({ description, action, onDismiss }: InstallBannerProps) {
  const handleDismiss = () => {
    hapticSubtle()
    onDismiss()
  }

  return (
    <div style={wrapperStyle}>
      <div style={cardStyle}>
        <button onClick={handleDismiss} style={dismissStyle} aria-label='Dismiss'>
          <svg width='18' height='18' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
            <path
              d='M6 6l12 12M18 6L6 18'
              stroke='currentColor'
              strokeWidth='2'
              strokeLinecap='round'
            />
          </svg>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingRight: 24 }}>
          <div style={iconStyle}>
            <HomeIcon />
          </div>
          <span style={{ color: 'var(--fg)', fontWeight: 700, fontSize: 17, lineHeight: 1.3, fontFamily: FONT }}>
            Add CHIMERA to your home screen
          </span>
        </div>
        <span style={{ color: 'var(--neutral-600)', fontSize: 14, lineHeight: 1.5, fontFamily: FONT }}>
          {description}
        </span>
        {action ? <Button label={action.label} onClick={action.onClick} /> : null}
      </div>
    </div>
  )
}
