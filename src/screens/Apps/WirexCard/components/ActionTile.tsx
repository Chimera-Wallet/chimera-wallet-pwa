import { ReactNode } from 'react'
import { hapticLight } from '../../../../lib/haptics'

interface ActionTileProps {
  icon: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  testId?: string
}

/** Square action tile: icon in a dark circle above an uppercase label. */
export default function ActionTile({ icon, label, onClick, disabled, testId }: ActionTileProps) {
  return (
    <button
      type='button'
      data-testid={testId}
      disabled={disabled}
      onClick={() => {
        hapticLight()
        onClick()
      }}
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.6rem',
        padding: '0.9rem 0.25rem',
        borderRadius: 8,
        border: 'none',
        background: 'var(--dark10)',
        color: 'var(--white)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'var(--black)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
    </button>
  )
}
