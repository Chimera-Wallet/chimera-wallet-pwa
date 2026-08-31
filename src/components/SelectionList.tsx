import { ReactElement } from 'react'
import ArrowIcon from '../icons/Arrow'
import ExternalLinkIcon from '../icons/ExternalLink'
import Text from './Text'
import Focusable from './Focusable'
import { hapticSubtle } from '../lib/haptics'
import checkMark from '../../public/images/icons/ CheckCheckMark.png'


export type BadgeTone = 'danger' | 'success' | 'warning' | 'neutral'

export interface SelectionRow {
  /** Either a React element (icon component) or a URL string to an image/SVG */
  icon: ReactElement | string
  key: string
  label: string
  badge?: { text: string; tone: BadgeTone }
  right?: 'chevron' | 'external' | 'toggle'
  checked?: boolean
  onClick?: () => void
  danger?: boolean
}

interface Props {
  rows: SelectionRow[]
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

export default function SelectionList({ rows }: Props) {
  return (
    <div style={cardStyle}>
      {rows.map((row, index) => {
        const { icon, label, badge, right = 'chevron', checked, onClick, danger } = row
        const isLast = index === rows.length - 1

        const go = () => {
          hapticSubtle()
          ;(onClick ?? (() => {}))()
        }

        return (
          <Focusable onEnter={go} key={row.key}>
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
                    overflow: 'hidden',
                  }}
                >
                  {typeof icon === 'string' ? (
                    <img src={icon} alt='' style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {icon}
                    </div>
                  )}
                </div>
                <Text capitalize={false} medium>
                  {label}
                </Text>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexShrink: 0, paddingLeft: 8 }}>
                {badge ? <Badge text={badge.text} tone={badge.tone} /> : null}
                {right === 'toggle' ? (
                  checked ? (
                    <img src={checkMark} alt='check' style={{ width: 20, height: 20, display: 'block' }} />
                  ) : (
                    <span style={{ width: 24, height: 24 }} />
                  )
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