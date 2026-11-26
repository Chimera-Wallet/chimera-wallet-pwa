// Card walkthrough (Figma "Card / Walkthrough / 01–03"). Each step plays the
// design's entrance timeline once while its progress segment fills over
// STEP_MS, then moves on to the next step (the last one waits for the button).

import { CSSProperties, ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MotionConfig, motion, type Easing } from 'framer-motion'
import { hapticLight } from '../../../lib/haptics'
import AssetIcon from '../../../icons/AssetIcon'
import { CardArt, FrozenBadge } from './shared'

interface WalkthroughProps {
  onDone: () => void
}

const STEPS = ['card', 'topUp', 'control'] as const

/** Figma timeline length; the progress fill runs for this long. */
const STEP_MS = 5000

/** The Figma visual frame; its contents are laid out in these coordinates. */
const VISUAL_W = 390
const VISUAL_H = 460

/** Sample digits shown on the illustration cards (as in Figma). */
const DEMO_LAST4 = '0025'

const ease = { out: 'easeOut', in: 'easeIn', inOut: 'easeInOut', linear: 'linear' } satisfies Record<string, Easing>

const abs = (left: number, top: number, extra?: CSSProperties): CSSProperties => ({
  position: 'absolute',
  left,
  top,
  ...extra,
})

/** Scale for the visual so the 390×460 frame fits the space left between the copy and the button. */
function useFitScale() {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width && height) setScale(Math.min(1, width / VISUAL_W, height / VISUAL_H))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { ref, scale }
}

/**
 * Figma "Cascade / Card N": a 330px box sliding in from above, holding a card
 * that settles from `fromDeg` to its resting `deg`.
 */
function CascadeCard(props: {
  left: number
  top: number
  width: number
  deg: number
  fromDeg: number
  delay: number
  blur?: number
  shadow: number
}) {
  const { left, top, width, deg, fromDeg, delay, blur, shadow } = props
  return (
    <motion.div
      style={abs(left, top, {
        width: 330,
        height: 330,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        filter: blur ? `blur(${blur}px)` : undefined,
      })}
      initial={{ opacity: 0, y: -520 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        opacity: { delay, duration: 0.2, ease: ease.out },
        y: { delay, duration: 0.75, ease: ease.out },
      }}
    >
      <motion.div
        initial={{ rotate: fromDeg }}
        animate={{ rotate: deg }}
        transition={{ delay, duration: 0.85, ease: ease.out }}
      >
        <CardArt
          width={width}
          last4={DEMO_LAST4}
          style={{ filter: `drop-shadow(0 ${shadow}px ${shadow}px rgba(3, 8, 51, 0.65))` }}
        />
      </motion.div>
    </motion.div>
  )
}

/** Step 1: three cards cascading in. */
function CardCascade() {
  return (
    <>
      <CascadeCard left={27} top={243} width={210} deg={-30} fromDeg={-16} delay={0.71} blur={3.5} shadow={19.6} />
      <CascadeCard left={65} top={100} width={255} deg={22} fromDeg={8} delay={0.43} blur={1.5} shadow={23.8} />
      <CascadeCard left={27} top={-75} width={300} deg={-17} fromDeg={-3} delay={0.15} shadow={28} />
    </>
  )
}

/** A Figma "Coin": drops in, then falls into the card and fades. Times are in seconds from the step start. */
function Coin(props: {
  symbol: string
  left: number
  top: number
  /** Appear (start fading/dropping in). */
  t0: number
  /** Start falling into the card. */
  t1: number
  fall: number
  drift?: number
}) {
  const { symbol, left, top, t0, t1, fall, drift = 0 } = props
  const end = t1 + 0.5
  const at = (...ts: number[]) => ts.map((t) => t / end)
  return (
    <motion.div
      style={abs(left, top, { width: 52, height: 52, filter: 'drop-shadow(0 8px 10px rgba(0, 0, 0, 0.35))' })}
      initial={{ opacity: 0, x: 0, y: -60 }}
      animate={{ opacity: [0, 0, 1, 1, 0], y: [-60, -60, 0, 0, fall], x: [0, 0, drift] }}
      transition={{
        opacity: {
          duration: end,
          times: at(0, t0, t0 + 0.4, t1, end),
          ease: [ease.linear, ease.out, ease.linear, ease.in],
        },
        y: { duration: end, times: at(0, t0, t0 + 0.5, t1, end), ease: [ease.linear, ease.out, ease.linear, ease.in] },
        x: { duration: end, times: at(0, t1, end), ease: [ease.linear, ease.in] },
      }}
    >
      <AssetIcon symbol={symbol} size={52} />
    </motion.div>
  )
}

/** Step 2: coins drop into the card, which pulses, then the "+500,00 USD" badge appears. */
function CoinsIntoCard() {
  return (
    <>
      <motion.div
        style={abs(45, 215.21)}
        initial={{ opacity: 0, y: 120, scale: 1 }}
        animate={{ opacity: 1, y: 0, scale: [1, 1, 1.04, 1] }}
        transition={{
          opacity: { delay: 0.1, duration: 0.4, ease: ease.out },
          y: { delay: 0.1, duration: 0.6, ease: ease.out },
          scale: { duration: 2.7, times: [0, 2.2 / 2.7, 2.4 / 2.7, 1], ease: [ease.linear, ease.out, ease.inOut] },
        }}
      >
        <CardArt width={300} last4={DEMO_LAST4} style={{ filter: 'drop-shadow(0 24px 24px rgba(5, 13, 77, 0.6))' }} />
      </motion.div>
      <Coin symbol='BTC' left={79} top={104} t0={0.6} t1={1.7} fall={110} drift={80} />
      <Coin symbol='USDT' left={169} top={74} t0={0.75} t1={1.8} fall={140} />
      <Coin symbol='ETH' left={259} top={104} t0={0.9} t1={1.9} fall={110} drift={-80} />
      <div style={abs(0, 431, { right: 0, display: 'flex', justifyContent: 'center' })}>
        <motion.span
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.4, duration: 0.4, ease: ease.out }}
          style={{
            padding: '6px 14px',
            borderRadius: 16,
            background: '#fff',
            color: '#1f3bdb',
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 'normal',
            whiteSpace: 'nowrap',
          }}
        >
          +500,00 USD
        </motion.span>
      </div>
    </>
  )
}

/** Step 3: the card tilts in, frosts over and shows the "Card frozen" badge. */
function FreezingCard({ label }: { label: string }) {
  const CARD_W = 300
  const CARD_H = 189.571
  return (
    <>
      <div style={abs(195 - CARD_W / 2, 250 - CARD_H / 2)}>
        <motion.div
          initial={{ opacity: 0, y: 100, rotate: 0 }}
          animate={{ opacity: 1, y: 0, rotate: 6 }}
          transition={{
            opacity: { delay: 0.1, duration: 0.4, ease: ease.out },
            y: { delay: 0.1, duration: 0.6, ease: ease.out },
            rotate: { delay: 0.7, duration: 0.4, ease: ease.inOut },
          }}
          style={{ position: 'relative' }}
        >
          <CardArt
            width={CARD_W}
            last4={DEMO_LAST4}
            style={{ filter: 'drop-shadow(0 24px 24px rgba(5, 13, 77, 0.6))' }}
          />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.5, ease: ease.inOut }}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 15,
              background: 'rgba(209, 229, 255, 0.35)',
              backdropFilter: 'blur(3px)',
              WebkitBackdropFilter: 'blur(3px)',
            }}
          />
        </motion.div>
      </div>
      <div style={abs(0, 235, { right: 0, display: 'flex', justifyContent: 'center' })}>
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            opacity: { delay: 1.5, duration: 0.3, ease: ease.out },
            scale: { delay: 1.5, duration: 0.35, ease: ease.out },
          }}
        >
          <FrozenBadge label={label} />
        </motion.div>
      </div>
    </>
  )
}

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.4, ease: ease.out },
})

export default function WirexWalkthrough({ onDone }: WalkthroughProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState(0)
  const touchX = useRef<number | null>(null)
  const { ref: visualRef, scale } = useFitScale()

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
    card: <CardCascade />,
    topUp: <CoinsIntoCard />,
    control: <FreezingCard label={t('apps.wirexCard.walkthrough.frozen')} />,
  }

  return (
    <MotionConfig reducedMotion='user'>
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
          overflow: 'hidden',
          background: 'linear-gradient(180deg, #1f3bdb 13.743%, #030e4e 98.67%)',
          color: '#fff',
          fontFamily: 'Titillium Web, sans-serif',
          padding: '0 16px',
          paddingTop: 'calc(3px + env(safe-area-inset-top))',
          paddingBottom: 'calc(1.5rem + var(--padding-bottom, 0px) + env(safe-area-inset-bottom))',
        }}
      >
        {/* Progress: one segment per step, tappable. The current one fills over STEP_MS. */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
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
                  position: 'relative',
                  display: 'block',
                  height: 2,
                  borderRadius: 1,
                  overflow: 'hidden',
                  background: i < step ? '#fff' : 'rgba(255, 255, 255, 0.3)',
                }}
              >
                {i === step ? (
                  <motion.span
                    key={`fill-${step}`}
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: STEP_MS / 1000, ease: ease.linear }}
                    onAnimationComplete={() => {
                      if (!last) setStep((n) => Math.min(n + 1, STEPS.length - 1))
                    }}
                    style={{ position: 'absolute', left: 0, top: 0, bottom: 0, background: '#fff', borderRadius: 1 }}
                  />
                ) : null}
              </span>
            </button>
          ))}
        </div>

        <div key={key} style={{ flexShrink: 0 }}>
          <motion.h2
            {...fadeUp(0.1)}
            style={{ margin: '46px 0 0', fontSize: 16, fontWeight: 600, lineHeight: 'normal', letterSpacing: 1 }}
          >
            {t(`apps.wirexCard.walkthrough.${key}.title`)}
          </motion.h2>
          <motion.p {...fadeUp(0.25)} style={{ margin: '33px 0 0', fontSize: 13, lineHeight: '16px' }}>
            {t(`apps.wirexCard.walkthrough.${key}.body`)}
          </motion.p>
        </div>

        <div ref={visualRef} style={{ position: 'relative', flex: 1, minHeight: 0, marginTop: 64 }}>
          <div
            key={`${key}-visual`}
            style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              width: VISUAL_W,
              height: VISUAL_H,
              transform: `translateX(-50%) scale(${scale})`,
              transformOrigin: 'top center',
            }}
          >
            {/* Figma "Circle": soft radial glow behind the visual. */}
            <img
              src='/images/card/walkthrough-glow.svg'
              alt=''
              aria-hidden
              style={abs(-18.4, 13.6, { width: 407.6, height: 418.4, pointerEvents: 'none' })}
            />
            {visuals[key]}
          </div>
        </div>

        <button
          type='button'
          data-testid='wirex-walkthrough-next'
          onClick={next}
          style={{
            // Above the visual: the back card in step 1 tucks behind the button (Figma).
            position: 'relative',
            zIndex: 1,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            height: 48,
            marginTop: 37,
            padding: '12px 16px',
            borderRadius: 16,
            border: 'none',
            background: '#1f3bdb',
            color: '#fff',
            fontFamily: 'inherit',
            fontSize: 14,
            fontWeight: 600,
            lineHeight: '16px',
            letterSpacing: 1,
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          {last ? t('apps.wirexCard.walkthrough.getCard') : t('apps.wirexCard.walkthrough.continue')}
          <span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src='/images/card/stake.svg' alt='' width={13.333} height={12} />
          </span>
        </button>
      </div>
    </MotionConfig>
  )
}
