import { IonButton } from '@ionic/react'
import { ReactElement, useCallback, useState } from 'react'
import { hapticTap } from '../lib/haptics'

interface ButtonProps {
  clear?: boolean
  disabled?: boolean
  icon?: ReactElement
  label: string
  loading?: boolean
  onClick: (event: any) => void
  outline?: boolean
  red?: boolean
  secondary?: boolean
}

export default function Button({ clear, disabled, icon, label, loading, onClick, outline, red, secondary }: ButtonProps) {
  const [pressed, setPressed] = useState(false)

  const variant = red ? 'red' : secondary ? 'secondary' : clear ? 'clear' : outline ? 'outline' : 'primary'
  const className = `${variant}${pressed ? ' pressed' : ''}`

  const handlePressStart = useCallback(() => {
    if (disabled || loading) return
    setPressed(true)
  }, [disabled, loading])

  const handlePressEnd = useCallback(() => {
    setPressed(false)
  }, [])

  const handleClick = useCallback(
    (event: any) => {
      hapticTap()
      onClick(event)
    },
    [onClick],
  )

  return (
    <IonButton
      className={className}
      disabled={disabled}
      expand='block'
      fill={clear ? 'clear' : outline ? 'outline' : 'solid'}
      onClick={handleClick}
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
      onMouseLeave={handlePressEnd}
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
      onTouchCancel={handlePressEnd}
      style={{ margin: '4px 0' }}
    >
      {loading ? (
        <ButtonCentered>
          <div className='spinner' />
        </ButtonCentered>
      ) : icon ? (
        <ButtonWithIcon icon={icon} label={label} />
      ) : (
        <ButtonCentered>
          <Label label={label} />
        </ButtonCentered>
      )}
    </IonButton>
  )
}

function ButtonCentered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', gap: '0.5rem' }}>
      {children}
    </div>
  )
}

function ButtonWithIcon({ icon, label }: { icon: ReactElement; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', width: '100%', gap: '0.5rem' }}>
      <span style={{ opacity: 0.5, display: 'flex', alignItems: 'center' }}>{icon}</span>
      <Label label={label} />
    </div>
  )
}

const Label = ({ label }: { label: string }) => <p style={{ lineHeight: '20px' }}>{label}</p>
