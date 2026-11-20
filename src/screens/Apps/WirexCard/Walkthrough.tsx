import { ReactNode, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CreditCard, Snowflake } from 'lucide-react'
import { hapticLight } from '../../../lib/haptics'
import AssetIcon from '../../../icons/AssetIcon'
import { CardArt } from './shared'

interface WalkthroughProps {
  onDone: () => void
}

const STEPS = ['card', 'topUp', 'control'] as const

const keyframes = `
@keyframes wx-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }
@keyframes wx-fade-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
@media (prefers-reduced-motion: reduce) { .wx-anim { animation: none !important } }
`

const glow = (size: number, opacity = 0.55) => (
  <div
    style={{
      position: 'absolute',
      width: size,
      height: size,
      borderRadius: '50%',
      background: `radial-gradient(circle, rgba(52, 92, 255, ${opacity}) 0%, rgba(52, 92, 255, 0) 70%)`,
      pointerEvents: 'none',
    }}
  />
)

function CardStack() {
  return (
    <div style={{ position: 'relative', width: 300, height: 380 }}>
      <CardArt
        width={210}
        style={{ position: 'absolute', left: 30, top: 270, transform: 'rotate(-14deg)', filter: 'blur(5px)', opacity: 0.8 }}
      />
      <CardArt
        width={210}
        style={{ position: 'absolute', left: 70, top: 170, transform: 'rotate(-22deg)', filter: 'blur(1.5px)', opacity: 0.9 }}
      />
      <CardArt
        width={250}
        style={{ position: 'absolute', left: 10, top: 20, transform: 'rotate(-20deg)' }}
      />
    </div>
  )
}

function CoinsOverCard() {
  const coin = (symbol: string, style: React.CSSProperties, delay: string) => (
    <div
      className='wx-anim'
      style={{
        position: 'absolute',
        borderRadius: '50%',
        boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)',
        animation: `wx-float 3.2s ease-in-out ${delay} infinite`,
        ...style,
      }}
    >
      <AssetIcon symbol={symbol} size={40} />
    </div>
  )
  return (
    <div style={{ position: 'relative', width: 300, height: 340, display: 'flex', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', top: 40, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        {glow(280)}
      </div>
      {coin('BTC', { left: 48, top: 30 }, '0s')}
      {coin('USDT', { left: 130, top: 0 }, '0.6s')}
      {coin('ETH', { left: 212, top: 30 }, '1.2s')}
      <CardArt width={232} style={{ position: 'absolute', top: 115 }} />
      <span
        style={{
          position: 'absolute',
          top: 295,
          padding: '6px 14px',
          borderRadius: 999,
          background: '#fff',
          color: '#1f36d6',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        +500,00 USD
      </span>
    </div>
  )
}

function FrozenCard({ label }: { label: string }) {
  return (
    <div style={{ position: 'relative', width: 300, height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {glow(300, 0.45)}
      <div style={{ position: 'relative', transform: 'rotate(8deg)' }}>
        <CardArt
          width={240}
          style={{ background: 'linear-gradient(160deg, #6f86f2 0%, #5a72e6 100%)', filter: 'blur(1.5px)' }}
        />
        <span
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(-8deg)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 999,
            background: 'rgba(20, 24, 50, 0.85)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1,
            whiteSpace: 'nowrap',
          }}
        >
          <Snowflake size={12} />
          {label}
        </span>
      </div>
    </div>
  )
}

export default function WirexWalkthrough({ onDone }: WalkthroughProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState(0)
  const touchX = useRef<number | null>(null)

  const last = step === STEPS.length - 1
  const key = STEPS[step]

  const goTo = (next: number) => {
    if (next < 0 || next >= STEPS.length || next === step) return
    hapticLight()
    setStep(next)
  }

  const next = () => {
    if (last) {
      hapticLight()
      onDone()
    } else goTo(step + 1)
  }

  const visuals: Record<(typeof STEPS)[number], ReactNode> = {
    card: <CardStack />,
    topUp: <CoinsOverCard />,
    control: <FrozenCard label={t('apps.wirexCard.walkthrough.frozen')} />,
  }

  return (
    <div
      className='content'
      data-testid='wirex-walkthrough'
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        touchX.current = null
        if (Math.abs(dx) > 50) goTo(step + (dx < 0 ? 1 : -1))
      }}
      style={{
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'hidden',
        background: 'linear-gradient(180deg, #1f3bdb 0%, #1a30c4 45%, #030e4e 100%)',
        color: '#fff',
        fontFamily: 'Titillium Web, sans-serif',
        padding: '0 1.5rem',
        paddingTop: 'calc(1rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(1.5rem + var(--padding-bottom, 0px) + env(safe-area-inset-bottom))',
      }}
    >
      <style>{keyframes}</style>

      {/* Step indicator — tappable */}
      <div style={{ display: 'flex', gap: 6 }}>
        {STEPS.map((s, i) => (
          <button
            key={s}
            type='button'
            aria-label={`${i + 1} / ${STEPS.length}`}
            aria-current={i === step ? 'step' : undefined}
            onClick={() => goTo(i)}
            style={{ flex: 1, padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <span
              style={{
                display: 'block',
                height: 2,
                borderRadius: 1,
                background: i <= step ? '#fff' : 'rgba(255, 255, 255, 0.3)',
                transition: 'background 0.3s ease',
              }}
            />
          </button>
        ))}
      </div>

      <div key={key} className='wx-anim' style={{ animation: 'wx-fade-in 0.35s ease-out', marginTop: '2.5rem' }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: 0.3 }}>
          {t(`apps.wirexCard.walkthrough.${key}.title`)}
        </h2>
        <p style={{ margin: '1.75rem 0 0', fontSize: 12, lineHeight: 1.4, color: 'rgba(255, 255, 255, 0.85)' }}>
          {t(`apps.wirexCard.walkthrough.${key}.body`)}
        </p>
      </div>

      <div
        key={`${key}-visual`}
        className='wx-anim'
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'wx-fade-in 0.45s ease-out',
        }}
      >
        {visuals[key]}
      </div>

      <button
        type='button'
        data-testid='wirex-walkthrough-next'
        onClick={next}
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '0.95rem 0.9rem',
          borderRadius: 12,
          border: 'none',
          background: '#2a44e6',
          color: '#fff',
          fontFamily: 'inherit',
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: 1,
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        {last ? t('apps.wirexCard.walkthrough.getCard') : t('apps.wirexCard.walkthrough.continue')}
        <CreditCard size={14} style={{ opacity: 0.5 }} />
      </button>
    </div>
  )
}
