import React from 'react'
import { hapticSubtle } from '../lib/haptics'

interface BannerDismissProps {
  onDismiss: () => void
  /** Sit on a dark disc, for banners whose top-right corner holds artwork
   * (the staking card's coins) that a bare icon would get lost against. */
  onArtwork?: boolean
}

const baseStyle: React.CSSProperties = {
  position: 'absolute',
  top: 14,
  right: 14,
  border: 'none',
  cursor: 'pointer',
  padding: 6,
  lineHeight: 0,
  touchAction: 'manipulation',
  zIndex: 3,
}

const plainStyle: React.CSSProperties = {
  ...baseStyle,
  background: 'none',
  color: 'var(--neutral-500)',
}

const artworkStyle: React.CSSProperties = {
  ...baseStyle,
  top: 10,
  right: 10,
  background: 'rgba(0,0,0,0.45)',
  borderRadius: '50%',
  color: '#fff',
}

/** The close (X) button in the top-right corner of a home-screen banner. */
export default function BannerDismiss({ onDismiss, onArtwork }: BannerDismissProps) {
  const handleDismiss = () => {
    hapticSubtle()
    onDismiss()
  }

  return (
    <button onClick={handleDismiss} style={onArtwork ? artworkStyle : plainStyle} aria-label='Dismiss'>
      <svg width='18' height='18' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
        <path d='M6 6l12 12M18 6L6 18' stroke='currentColor' strokeWidth='2' strokeLinecap='round' />
      </svg>
    </button>
  )
}
