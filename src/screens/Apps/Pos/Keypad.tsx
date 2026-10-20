import { Delete } from 'lucide-react'
import { hapticTap } from '../../../lib/haptics'
import { KEYPAD_ROWS, type KeypadKey } from '../../../lib/keypad'

interface KeypadProps {
  onKey: (key: KeypadKey) => void
  /** Hide the decimal key for integer units (sats). */
  allowDecimal: boolean
}

/** Large tile keypad for the POS terminal. */
export default function Keypad({ onKey, allowDecimal }: KeypadProps) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 6,
        gridTemplateColumns: 'repeat(3, 1fr)',
        padding: '0 0.5rem',
        width: '100%',
      }}
    >
      {KEYPAD_ROWS.flat().map((key) => {
        if (key === '.' && !allowDecimal) return <div key={key} />
        return (
          <button
            key={key}
            type='button'
            data-testid={`pos-key-${key}`}
            aria-label={key === 'x' ? 'Delete' : key}
            onClick={() => {
              hapticTap()
              onKey(key)
            }}
            style={{
              alignItems: 'center',
              backgroundColor: 'rgba(var(--fg-rgb), 0.16)',
              border: 'none',
              borderRadius: 6,
              color: 'var(--fg)',
              cursor: 'pointer',
              display: 'flex',
              fontSize: '2rem',
              fontWeight: 700,
              height: 'clamp(2.75rem, 7.5dvh, 4.5rem)',
              justifyContent: 'center',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {key === 'x' ? <Delete size={32} /> : key}
          </button>
        )
      })}
    </div>
  )
}
