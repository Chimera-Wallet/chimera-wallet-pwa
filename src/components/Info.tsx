import FlexRow from './FlexRow'
import InfoIcon, { InfoIconDark } from '../icons/Info'
import FlexCol from './FlexCol'
import Text from './Text'
import { ReactElement, ReactNode } from 'react'

interface InfoProps {
  children: ReactNode
  color: string
  icon?: ReactElement
  title: string
}

export default function Info({ children, color, icon, title }: InfoProps) {
  return (
    <FlexCol margin='0 0 2rem 0'>
      <FlexRow color={color}>
        {icon}
        <Text bold color={color}>
          {title}
        </Text>
      </FlexRow>
      <hr style={{ backgroundColor: 'var(--dark20)', width: '100%' }} />
      <FlexRow alignItems='flex-start'>
        <div style={{ marginTop: '2px' }}>
          <InfoIconDark />
        </div>
        <FlexCol gap='0.5rem'>{children}</FlexCol>
      </FlexRow>
    </FlexCol>
  )
}

export function InfoLine({
  centered,
  color,
  compact,
  icon,
  text,
}: {
  centered?: boolean
  color?: string
  compact?: boolean
  icon?: ReactElement
  text: string
}) {
  const defaultIcon = icon || <InfoIcon />

  return (
    <FlexCol margin={compact ? '0' : '0 0 1rem 0'}>
      <FlexRow centered={centered}>
        <div style={{ color: color ? `var(--${color})` : 'currentColor' }}>{defaultIcon}</div>
        <Text small wrap>
          {text}
        </Text>
      </FlexRow>
    </FlexCol>
  )
}
