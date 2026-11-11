import { Eye, EyeOff } from 'lucide-react'

interface CardVisualProps {
  last4?: string
  hidden: boolean
  onToggleHidden: () => void
}

/**
 * Card artwork from the design. PLACEHOLDER art: gradient + glow in CSS and
 * the existing white logo, until a dedicated card asset is supplied.
 */
export default function CardVisual({ last4, hidden, onToggleHidden }: CardVisualProps) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0 0' }}>
      <div
        data-testid='wirex-card-visual'
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 280,
          aspectRatio: '1.586',
          borderRadius: 16,
          background: 'linear-gradient(135deg, #1b1f6b 0%, #0b0d2e 55%, #05061a 100%)',
          boxShadow: '0 0 48px 6px rgba(52, 72, 255, 0.55), inset 0 0 0 1px rgba(120, 140, 255, 0.35)',
          overflow: 'hidden',
          color: 'var(--white)',
        }}
      >
        <button
          type='button'
          onClick={onToggleHidden}
          aria-label={hidden ? 'Show balance' : 'Hide balance'}
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 30,
            height: 30,
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(255,255,255,0.15)',
            color: 'var(--white)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          {hidden ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        <span
          style={{
            position: 'absolute',
            left: 16,
            bottom: 16,
            fontFamily: 'Geist Mono, monospace',
            fontSize: 12,
            letterSpacing: 1,
          }}
        >
          ••{last4 ?? '••••'}
        </span>
        <img
          src='/images/chimera_white_logo.png'
          alt='Chimera'
          style={{ position: 'absolute', right: 14, bottom: 12, height: 28, objectFit: 'contain', opacity: 0.9 }}
        />
      </div>
    </div>
  )
}
