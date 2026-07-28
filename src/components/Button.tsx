import { ReactElement, ReactNode, useCallback, useState } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { hapticLight, hapticTap } from '../lib/haptics'
import ScanIcon from '../icons/Scan'
import PasteIcon from '../icons/Paste'
import XIcon from '../icons/X'
import { cn } from '@/lib/utils'
import addressIcon from '../../public/images/icons/ Book.png'

const buttonVariants = cva('button', {
  variants: {
    variant: {
      default: 'dark',
      secondary: 'secondary',
      destructive: 'red',
      ghost: 'clear',
      outline: 'outline',
      copy: 'copy',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

interface ButtonProps extends VariantProps<typeof buttonVariants> {
  ariaLabel?: string
  children?: ReactNode
  className?: string
  clear?: boolean
  copy?: boolean
  disabled?: boolean
  fancy?: boolean
  icon?: ReactElement
  label?: string
  loading?: boolean
  main?: boolean
  onClick: (event: any) => void
  outline?: boolean
  red?: boolean
  secondary?: boolean
  small?: boolean
  testId?: string
  style ?: React.CSSProperties
}

export default function Button({
  ariaLabel,
  children,
  className,
  clear,
  copy,
  disabled,
  fancy,
  icon,
  label,
  loading,
  main,
  onClick,
  outline,
  red,
  secondary,
  testId,
  variant,
  style, 
}: ButtonProps) {
  const [pressed, setPressed] = useState(false)

  // Support both old boolean props and new variant prop
  const resolvedVariant =
    variant ??
    (red ? 'destructive' : secondary ? 'secondary' : clear ? 'ghost' : outline ? 'outline' : copy ? 'copy' : 'default')

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
    <button
      aria-label={ariaLabel || label}
      type='button'
      className={cn(buttonVariants({ variant: resolvedVariant }), pressed && 'pressed', className)}
      disabled={disabled}
      onClick={handleClick}
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
      data-testid={testId}
      onMouseLeave={handlePressEnd}
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
      onTouchCancel={handlePressEnd}
      style={style ?? { margin: '4px 0', fontFamily: 'Titillium Web', fontStyle:'semibold', fontWeight : 600, }}
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
    </button>
  )
}

function ButtonCentered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', gap: '0.5rem', padding: '0 1rem' }}>
      {children}
    </div>
  )
}

function ButtonWithIcon({ icon, label }: { icon: ReactElement; label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '0.5rem', padding: '0 1rem' }}>
      <Label label={label} />
      <span style={{ opacity: 0.5, display: 'flex', alignItems: 'center' }}>{icon}</span>
    </div>
  )
}

const Label = ({ label }: { label?: string }) => <p style={{ lineHeight: '20px' }}>{label}</p>

interface ButtonOnInputProps {
  ariaLabel?: string
  clear?: boolean
  label?: string
  icon?: ReactElement
  onClick: () => void
}

export function ButtonOnInput({ label, clear, icon, onClick, ariaLabel }: ButtonOnInputProps) {
  const handleClick = () => {
    hapticLight()
    onClick()
  }

  return (
    <button
      type='button'
      onClick={handleClick}
      aria-label={ariaLabel || label}
      className='pill-base'
      style={clear ? { border: 'none', background: 'none' } : {}}
    >
      {icon}
      {label}
    </button>
  )
}

export function PasteButtonOnInput({ onClick }: { onClick: () => void }) {
  return <ButtonOnInput label='Paste' icon={<PasteIcon />} onClick={onClick} />
}

export function ScanButtonOnInput({ onClick }: { onClick: () => void }) {
  return <ButtonOnInput label='Scan QR' icon={<ScanIcon />} onClick={onClick} />
}

export function ClearButtonOnInput({ onClick }: { onClick: () => void }) {
  return <ButtonOnInput ariaLabel='Clear' clear icon={<XIcon />} onClick={onClick} />
}

export function AddressButtonOnInput({ onClick }: { onClick: () => void }) {
  return <ButtonOnInput label='Address Book' icon={<img src={addressIcon} alt='Address' style = {{width: '16px', height: '16px',filter: 'brightness(0) invert(1)'}} />} onClick={onClick} />
}
