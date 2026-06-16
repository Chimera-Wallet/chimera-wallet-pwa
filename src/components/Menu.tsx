import { ReactElement, useContext } from 'react'
import ArrowIcon from '../icons/Arrow'
import ExternalLinkIcon from '../icons/ExternalLink'
import { OptionsContext } from '../providers/options'
import Text from './Text'
import { SettingsOptions } from '../lib/types'
import Focusable from './Focusable'
import { hapticSubtle } from '../lib/haptics'
import { Switch } from '@/components/ui/switch'

export type BadgeTone = 'danger' | 'success' | 'warning' | 'neutral'

export interface MenuRow {
  icon: ReactElement
  option: SettingsOptions
  /** Display label override. Falls back to the (capitalized) option name. */
  label?: string
  /** Small status pill shown before the right-hand affordance. */
  badge?: { text: string; tone: BadgeTone }
  /** Right-hand affordance. Defaults to a chevron. */
  right?: 'chevron' | 'external' | 'toggle'
  toggleChecked?: boolean
  onToggle?: () => void
  /** Renders the row as a destructive action (red icon). */
  danger?: boolean
}

interface MenuProps {
  rows: MenuRow[]
}

const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--surface)',
  borderRadius: 16,
  overflow: 'hidden',
  width: '100%',
}

const badgeToneStyle = (tone: BadgeTone): React.CSSProperties => {
  switch (tone) {
    case 'danger':
      return { backgroundColor: 'color-mix(in srgb, var(--red-500) 22%, transparent)', color: 'var(--red-400)' }
    case 'success':
      return { backgroundColor: 'color-mix(in srgb, var(--green-500) 22%, transparent)', color: 'var(--green-400)' }
    case 'warning':
      return { backgroundColor: 'color-mix(in srgb, var(--orange-500) 22%, transparent)', color: 'var(--orange-400)' }
    default:
      return { backgroundColor: 'rgba(var(--fg-rgb), 0.12)', color: 'var(--neutral-500)' }
  }
}

function Badge({ text, tone }: { text: string; tone: BadgeTone }) {
  return (
    <span
      style={{
        ...badgeToneStyle(tone),
        padding: '3px 8px',
        borderRadius: 6,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  )
}

export default function Menu({ rows }: MenuProps) {
  const { setOption } = useContext(OptionsContext)

  return (
    <div style={cardStyle}>
      {rows.map((row, index) => {
        const { icon, option, label, badge, right = 'chevron', toggleChecked, onToggle, danger } = row
        const isLast = index === rows.length - 1

        const go = () => {
          hapticSubtle()
          setOption(option)
        }

        return (
          <Focusable onEnter={go} key={option}>
            <div
              onClick={go}
              style={{
                alignItems: 'center',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: isLast ? 'none' : '1px solid rgba(var(--fg-rgb), 0.08)',
                width: '100%',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', minWidth: 0 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    backgroundColor: danger ? 'var(--red-500)' : '#000',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {icon}
                </div>
                <Text capitalize={!label} medium>
                  {label ?? option}
                </Text>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexShrink: 0, paddingLeft: 8 }}>
                {badge ? <Badge text={badge.text} tone={badge.tone} /> : null}
                {right === 'toggle' ? (
                  <Switch
                    checked={Boolean(toggleChecked)}
                    onCheckedChange={() => {
                      hapticSubtle()
                      ;(onToggle ?? go)()
                    }}
                    onClick={(e) => e.stopPropagation()}
                    size='lg'
                  />
                ) : right === 'external' ? (
                  <span style={{ color: 'var(--neutral-500)', display: 'flex' }}>
                    <ExternalLinkIcon />
                  </span>
                ) : (
                  <span style={{ color: 'var(--neutral-500)', display: 'flex' }}>
                    <ArrowIcon />
                  </span>
                )}
              </div>
            </div>
          </Focusable>
        )
      })}
    </div>
  )
}
