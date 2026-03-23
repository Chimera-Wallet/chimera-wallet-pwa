import { ReactNode } from 'react'

interface ShadowProps {
  border?: boolean
  borderPurple?: boolean
  children: ReactNode
  fat?: boolean
  flex?: boolean
  info?: boolean
  input?: boolean
  inverted?: boolean
  lighter?: boolean
  onClick?: () => void
  purple?: boolean
  red?: boolean
  slim?: boolean
  squared?: boolean
  testId?: string
}

export default function Shadow({
  border,
  borderPurple,
  children,
  fat,
  flex,
  info,
  input,
  inverted,
  lighter,
  onClick,
  purple,
  red,
  slim,
  squared,
  testId,
}: ShadowProps) {
  const style: React.CSSProperties = {
    backgroundColor: info
      ? 'var(--info-container-bg)'
      : input
        ? 'var(--input-bg)'
        : purple
          ? 'var(--blue-medium)'
          : red
            ? 'var(--red)'
            : lighter
              ? 'var(--dark05)'
              : inverted
                ? 'var(--blue-primary)'
                : 'var(--dark10)',
    border: input
      ? '1px solid var(--input-border-color)'
      : border
        ? `1px solid var(--${borderPurple ? 'purple' : 'dark10'})`
        : undefined,
    borderRadius: info
      ? 'var(--info-container-radius)'
      : input
        ? 'var(--input-border-radius)'
        : squared
          ? undefined
          : '0.5rem',
    color: purple ? 'white' : '',
    cursor: onClick ? 'pointer' : undefined,
    display: info ? 'flex' : input ? 'flex' : undefined,
    flexDirection: info ? 'column' : undefined,
    gap: info ? 'var(--info-container-gap)' : undefined,
    minHeight: input ? 'var(--input-height)' : undefined,
    padding: info
      ? 'var(--info-container-padding)'
      : slim
        ? '0.25rem'
        : fat
          ? '1rem'
          : input
            ? '0.5rem 1rem'
            : '0.5rem',
    width: flex ? undefined : '100%',
    alignItems: input ? 'center' : undefined,
    boxSizing: 'border-box',
  }

  return (
    <div data-testid={testId} onClick={onClick} style={style}>
      {children}
    </div>
  )
}
