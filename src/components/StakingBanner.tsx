import React, { useEffect, useState } from 'react'
import Button from './Button'

const LAUNCH_DATE = new Date('2026-05-27T14:12:00+02:00')

const TITLE = 'Be ready for the Chimera Token TGE'
const DESCRIPTION =
  'Lock your CEXT and watch your rewards grow over time, with annual returns of up to 15%, paid directly in CEXT to your wallet.'

const TELEGRAM_URL = 'https://t.me/Chimera_Community'

const FONT = "'Titillium Web', 'Geist', sans-serif"

interface CountdownParts {
  days: number
  hours: number
  minutes: number
  seconds: number
  expired: boolean
}

function useCountdown(): CountdownParts {
  const [parts, setParts] = useState<CountdownParts>(() => getCountdownParts())

  useEffect(() => {
    const id = setInterval(() => setParts(getCountdownParts()), 1000)
    return () => clearInterval(id)
  }, [])

  return parts
}

function getCountdownParts(): CountdownParts {
  const diff = LAUNCH_DATE.getTime() - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true }
  const totalSeconds = Math.floor(diff / 1000)
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    expired: false,
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

function CountdownDisplay({ parts }: { parts: CountdownParts }) {
  if (parts.expired) {
    return (
      <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: 16, fontFamily: FONT }}>Live now!</span>
    )
  }
  const segments = [
    { value: pad(parts.days), label: 'D' },
    { value: pad(parts.hours), label: 'H' },
    { value: pad(parts.minutes), label: 'M' },
    { value: pad(parts.seconds), label: 'S' },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {segments.map((seg, i) => (
        <React.Fragment key={seg.label}>
          <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: 16, fontFamily: FONT, letterSpacing: 0.5 }}>
            {seg.value} {seg.label}
          </span>
          {i < segments.length - 1 && (
            <span style={{ color: 'var(--white40)', fontSize: 14, fontWeight: 400 }}>|</span>
          )}
        </React.Fragment>
      ))}
      <span style={{ color: 'var(--white40)', fontSize: 14, fontWeight: 400 }}>|</span>
      <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: 16, fontFamily: FONT, letterSpacing: 1 }}>TO TGE</span>
    </div>
  )
}

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
        {/* Back coin (Token_02) — offset further down-right for depth */}
        <img
          src='/images/Token_02.png'
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
        {/* Front coin (Token_01) */}
        <img
          src='/images/Token_01.png'
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
  marginTop: '1.25rem',
}

const cardStyle: React.CSSProperties = {
  position: 'relative',
  overflow: 'visible',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: '20px 16px 16px 16px',
  width: '100%',
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

interface StakingBannerProps {
  variant: 'asset' | 'home'
}

export default function StakingBanner({ variant }: StakingBannerProps) {
  const parts = useCountdown()
  const launchingIn = parts.expired
    ? 'Live now!'
    : `Launching in ${pad(parts.days)}d ${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`

  if (variant === 'asset') {
    return (
      <div style={wrapperStyle}>
        <div style={cardStyle}>
          <CoinStack />
          <div style={topContentStyle}>
            <span style={{ color: 'white', fontWeight: 600, fontSize: 15, lineHeight: 1.3, fontFamily: FONT }}>
              {TITLE}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 1.5, fontFamily: FONT }}>
              {DESCRIPTION}
            </span>
            <div
              style={{
                background: 'rgba(255,255,255,0.12)',
                borderRadius: 10,
                padding: '10px 16px',
                textAlign: 'center',
                color: 'white',
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: '0.5px',
                fontFamily: FONT,
                userSelect: 'none',
              }}
            >
              {launchingIn}
            </div>
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
          <span style={{ color: 'white', fontWeight: 600, fontSize: 15, lineHeight: 1.3, fontFamily: FONT }}>
            {TITLE}
          </span>
          <CountdownDisplay parts={parts} />
        </div>
        <Button
          main
          fullWidth
          label='Join The Community'
          onClick={() => window.open(TELEGRAM_URL, '_blank', 'noopener,noreferrer')}
        />
      </div>
    </div>
  )
}
