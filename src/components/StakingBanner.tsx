import React from 'react'
import Button from './Button'
import { useTranslation } from 'react-i18next'

const TITLE = 'components.stakingBanner.title'
const DESCRIPTION =
  'components.stakingBanner.descr'

const TELEGRAM_URL = 'https://t.me/Chimera_Community'

const FONT = "'Titillium Web', sans-serif"

// 3D coin stack that protrudes above the top-right of the card
function CoinStack() {
  return (
    <div
      style={{
        position: 'absolute',
        top: -30,
        right: -10,
        transform: 'rotate(-10deg) perspective(300px) rotateY(-15deg)',
        filter: 'drop-shadow(0px 8px 16px rgba(0,0,0,0.5))',
        zIndex: 2,
        pointerEvents: 'none',
      }}
    >
      {/* Relative container so both images stack at same origin */}
      <div style={{ position: 'relative', width: 90, height: 110 }}>
        {/* Back coin — offset further down-right for depth */}
        <img
          src='/images/coin-3-2.png'
          alt=''
          style={{
            position: 'absolute',
            top: 36,
            left: 10,
            width: 80,
            height: 80,
            objectFit: 'contain',
            opacity: 0.85,
          }}
        />
        {/* Front coin */}
        <img
          src='/images/coin-3-1.png'
          alt=''
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 80,
            height: 80,
            objectFit: 'contain',
          }}
        />
      </div>
    </div>
  )
}

const wrapperStyle: React.CSSProperties = {
  position: 'relative',
  overflow: 'visible',
  width: '100%',
  height: '100%',
}

const cardStyle: React.CSSProperties = {
  position: 'relative',
  overflow: 'visible',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: '20px 16px 16px 16px',
  width: '100%',
  height: '100%',
  borderRadius: 20,
  backgroundColor: 'rgba(31, 59, 219, 0.5)',
  boxShadow: '0 20px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
  transform: 'translateZ(0)',
  boxSizing: 'border-box',
  fontFamily: FONT,
}

// Top content area reserves space on the right for the coin stack
const topContentStyle: React.CSSProperties = {
  paddingRight: 110,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const titleStyle: React.CSSProperties = {
  color: 'white',
  fontWeight: 600,
  fontSize: 15,
  lineHeight: 1.3,
  fontFamily: FONT,
}

const descriptionStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.75)',
  fontSize: 13,
  lineHeight: 1.5,
  fontFamily: FONT,
}

interface StakingBannerProps {
  variant: 'asset' | 'home'
}

export default function StakingBanner({ variant }: StakingBannerProps) {
  const { t } = useTranslation()

  if (variant === 'asset') {
    return (
      <div style={wrapperStyle}>
        <div style={cardStyle}>
          <CoinStack />
          <div style={topContentStyle}>
            <span style={titleStyle}>{t(TITLE)}</span>
            <span style={descriptionStyle}>{t(DESCRIPTION)}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={wrapperStyle}>
      <div style={cardStyle}>
        <CoinStack />
        <div style={topContentStyle}>
          <span style={titleStyle}>{t(TITLE)}</span>
          <span style={descriptionStyle}>{t(DESCRIPTION)}</span>
        </div>
        <Button
          label={t('components.stakingBanner.joinComm')}
          onClick={() => window.open(TELEGRAM_URL, '_blank', 'noopener,noreferrer')}
        />
      </div>
    </div>
  )
}
