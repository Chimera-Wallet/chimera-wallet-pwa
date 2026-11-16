import { CSSProperties, ReactNode } from 'react'
import { ArrowUpDown, ChevronDown, CreditCard, Download, Repeat, Snowflake } from 'lucide-react'
import { prettyNumber } from '../../../lib/format'
import { hapticLight } from '../../../lib/haptics'
import { CARD_CURRENCY, type WirexCardTx, type WirexCardTxType } from '../../../lib/wirexCard'

// Navigation data

export type MoveDirection = 'fromCard' | 'toCard'

/** navigationData for Pages.AppWirexMoveAssets. */
export interface MoveAssetsNavData {
  direction: MoveDirection
  userAddress: string
  cardId: string
}

/** navigationData for Pages.AppWirexTopUp. */
export interface TopUpNavData {
  userAddress: string
  cardId: string
}

// Card artwork

interface CardArtProps {
  /** Pixel width, or '100%' to fill the parent. Everything inside scales with it. */
  width?: number | string
  last4?: string
  /**
   * Corner radius. Defaults to the Figma corner as a percentage of the card's
   * width / height, so it scales with the card (cqw can't be used here: on the
   * card itself it resolves against the parent).
   */
  radius?: number | string
  /** When set, renders the frozen look (Figma): lighter card, blurred details, this label in a centred pill. */
  frozenLabel?: string
  style?: CSSProperties
}

const ACTIVE_BG = 'linear-gradient(160deg, #2440e6 0%, #1f38d6 100%)'
// Figma: soft blue glow around the card plus a faint light edge, no dark drop shadow.
const ACTIVE_SHADOW = '0 0 36px 2px rgba(31, 56, 214, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.08)'
const FROZEN_SHADOW = '0 0 36px 2px rgba(116, 137, 243, 0.3), inset 0 0 0 1px rgba(255, 255, 255, 0.12)'
const FROZEN_BG = 'linear-gradient(160deg, #7489f3 0%, #6278ea 55%, #5a70e2 100%)'

// Sizes are authored against a 230px-wide card and expressed in container
// units, so the artwork scales with whatever width it's given.
const u = (px: number) => `${(px / 230) * 100}cqw`

/**
 * Blue "Debit / VISA Platinum" card artwork (Card walkthrough + card home).
 * PLACEHOLDER art in CSS/SVG until a dedicated card asset is supplied; "VISA"
 * is styled text, not the official logo.
 */
export function CardArt({ width = 320, last4, radius = 16, frozenLabel, style }: CardArtProps) {
  const frozen = frozenLabel !== undefined
  return (
    <div
      aria-hidden
      style={{
        position: 'relative',
        width,
        // Figma card is 320×206; height follows the width at that ratio.
        aspectRatio: '320 / 206',
        containerType: 'inline-size',
        borderRadius: radius,
        background: frozen ? FROZEN_BG : ACTIVE_BG,
        transition: 'background 0.3s ease, box-shadow 0.3s ease',
        boxShadow: frozen ? FROZEN_SHADOW : ACTIVE_SHADOW,
        overflow: 'hidden',
        color: '#fff',
        fontFamily: 'Titillium Web, sans-serif',
        flexShrink: 0,
        ...style,
      }}
    >
      <div
        style={{ position: 'absolute', inset: 0, filter: frozen ? `blur(${u(3)})` : 'none', opacity: frozen ? 0.8 : 1 }}
      >
        {/* Strips on the left edge. Figma (on the 320×206 card): 72.82×80.7 group,
            62.65 from the top, flush left, solid #2F59ED. Three wedges, wide at
            the edge and tapering right; the middle one is the longest. */}
        <svg
          viewBox='0 0 100 100'
          preserveAspectRatio='none'
          style={{
            position: 'absolute',
            left: 0,
            top: `${(62.65 / 206) * 100}%`,
            width: `${(72.82 / 320) * 100}%`,
            height: `${(80.7 / 206) * 100}%`,
          }}
        >
          <polygon points='0,0 85,24 0,13' fill='#2F59ED' />
          <polygon points='0,43 100,50 0,57' fill='#2F59ED' />
          <polygon points='0,87 85,76 0,100' fill='#2F59ED' />
        </svg>
        <span style={{ position: 'absolute', top: u(8), right: u(12), fontSize: u(13), fontWeight: 600 }}>Debit</span>
        <span
          style={{
            position: 'absolute',
            left: u(14),
            bottom: u(12),
            fontFamily: 'Geist Mono, monospace',
            fontSize: u(9),
            letterSpacing: 1,
            opacity: 0.85,
          }}
        >
          •• {last4 ?? '••••'}
        </span>
        <span
          style={{
            position: 'absolute',
            right: u(12),
            bottom: u(8),
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            lineHeight: 1,
          }}
        >
          <span style={{ fontSize: u(24), fontWeight: 900, fontStyle: 'italic', letterSpacing: -0.5 }}>VISA</span>
          <span style={{ fontSize: u(7), opacity: 0.85, marginTop: 1 }}>Platinum</span>
        </span>
      </div>
      {frozen ? (
        <span
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            alignItems: 'center',
            gap: u(4),
            padding: `${u(4)} ${u(9)}`,
            borderRadius: 999,
            background: 'rgba(16, 20, 48, 0.9)',
            fontSize: u(7.5),
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          <Snowflake style={{ width: u(9), height: u(9) }} />
          {frozenLabel}
        </span>
      ) : null}
    </div>
  )
}

// Card home

interface ActionTileProps {
  icon: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  testId?: string
  iconBackground?: string
}

export function ActionTile({
  icon,
  label,
  onClick,
  disabled,
  testId,
  iconBackground = 'var(--black)',
}: ActionTileProps) {
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
        gap: '0.5rem',
        padding: 0,
        border: 'none',
        background: 'none',
        color: 'var(--white)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: iconBackground,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
        }}
      >
        {label}
      </span>
    </button>
  )
}

const ICONS: Record<WirexCardTxType, JSX.Element> = {
  deposit: <Download size={16} />,
  payment: <CreditCard size={16} />,
  withdraw: <ArrowUpDown size={16} />,
  swap: <Repeat size={16} />,
}

const STATUS_STYLE: Record<WirexCardTx['status'], { color: string; background: string }> = {
  Confirmed: { color: 'var(--green-active)', background: 'rgba(29, 255, 120, 0.12)' },
  Pending: { color: 'var(--orange)', background: 'var(--orangebg)' },
  Failed: { color: 'var(--red)', background: 'var(--redbg)' },
}

const formatDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()

const signed = (n: number) => `${n >= 0 ? '+' : '-'}${prettyNumber(Math.abs(n), 2, true, 2)}`

/**
 * One card transaction: icon, date, title and status on the left; the amount
 * in the card currency on the right with the original currency underneath.
 * Rendered inside a grouped list (see CardHome), which draws the dividers.
 */
export function CardTxRow({ tx }: { tx: WirexCardTx }) {
  const primary = tx.fiatAmount ?? tx.amount
  const primaryCurrency = tx.fiatAmount !== undefined ? CARD_CURRENCY : tx.currency
  const showSecondary = tx.fiatAmount !== undefined && tx.currency !== CARD_CURRENCY
  const status = STATUS_STYLE[tx.status]

  return (
    <div
      data-testid='wirex-card-tx'
      style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 0.85rem' }}
    >
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'var(--black)',
          color: 'var(--white)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {ICONS[tx.type]}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 10, color: 'var(--grey)' }}>{formatDate(tx.date)}</span>
        <span
          style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {tx.title}
        </span>
        <span
          style={{
            alignSelf: 'flex-start',
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: 0.5,
            padding: '1px 5px',
            borderRadius: 3,
            textTransform: 'uppercase',
            ...status,
          }}
        >
          {tx.status}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: primary >= 0 ? 'var(--green-active)' : 'var(--white)' }}>
          {signed(primary)} {primaryCurrency}
        </span>
        {showSecondary ? (
          <span style={{ fontSize: 11, color: 'var(--grey)' }}>
            {prettyNumber(Math.abs(tx.amount), 8)} {tx.currency}
          </span>
        ) : null}
      </div>
    </div>
  )
}

// Transfer screens

const ROW_BG = 'var(--info-container-bg2)'

interface TransferAmountProps {
  value: string
  onChange: (raw: string) => void
  unit: string
  /** Secondary line under the amount, e.g. "≈ 12.30 USDT". */
  hint?: string
  disabled?: boolean
  testId?: string
  ariaLabel: string
}

/** Large centred amount input (native decimal keyboard) with its unit and a hint underneath. */
export function TransferAmount({ value, onChange, unit, hint, disabled, testId, ariaLabel }: TransferAmountProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '1rem 0 0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6, maxWidth: '100%' }}>
        <input
          type='text'
          inputMode='decimal'
          autoFocus
          placeholder='0'
          value={value}
          disabled={disabled}
          onChange={(ev) => onChange(ev.target.value)}
          aria-label={ariaLabel}
          data-testid={testId}
          style={{
            width: `${Math.max(1, value.length) + 0.3}ch`,
            maxWidth: '75vw',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--white)',
            fontSize: '2.75rem',
            fontWeight: 700,
            lineHeight: 1.1,
            textAlign: 'center',
            padding: 0,
          }}
        />
        <span style={{ fontSize: 15, fontWeight: 600 }}>{unit}</span>
      </div>
      {hint ? <span style={{ fontSize: 12, color: 'var(--grey)' }}>{hint}</span> : null}
    </div>
  )
}

/** The card's row icon: a rounded-square tile holding the design's card glyph. */
export const CardRowIcon = () => (
  <span
    style={{
      width: 36,
      height: 36,
      borderRadius: 10,
      border: '1px solid rgba(255, 255, 255, 0.12)',
      background: 'rgba(0, 0, 0, 0.25)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      boxSizing: 'border-box',
    }}
  >
    {/* Design's card glyph (24×24, white on transparent), shown at native size. */}
    <img src='/images/icons/cardIcon.png' alt='' width={24} height={24} />
  </span>
)

interface TransferRowProps {
  icon: ReactNode
  /** Small uppercase caption, e.g. "From · Card". */
  label: string
  /** Main line, e.g. "Card · 15,456.78 USD". */
  title: string
  /** Makes the row a picker (shows a chevron). */
  onClick?: () => void
  testId?: string
}

export function TransferRow({ icon, label, title, onClick, testId }: TransferRowProps) {
  const content = (
    <>
      {icon}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0, textAlign: 'left' }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: 'var(--grey)',
          }}
        >
          {label}
        </span>
        <span
          style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {title}
        </span>
      </span>
      {onClick ? <ChevronDown size={18} style={{ flexShrink: 0 }} /> : null}
    </>
  )
  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    width: '100%',
    padding: '0.9rem 1rem',
    borderRadius: 16,
    border: 'none',
    background: ROW_BG,
    color: 'var(--white)',
    boxSizing: 'border-box',
  }
  return onClick ? (
    <button type='button' data-testid={testId} onClick={onClick} style={{ ...style, cursor: 'pointer' }}>
      {content}
    </button>
  ) : (
    <div data-testid={testId} style={style}>
      {content}
    </div>
  )
}

/** The FROM and TO rows stacked, with the round flip button over the gap (static arrow when `onFlip` is absent). */
export function TransferRows({ from, to, onFlip }: { from: ReactNode; to: ReactNode; onFlip?: () => void }) {
  const circle: CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: '3px solid var(--bg)',
    background: 'var(--blue-primary)',
    color: 'var(--white)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    zIndex: 1,
  }
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {from}
      {to}
      {onFlip ? (
        <button
          type='button'
          aria-label='Flip direction'
          data-testid='wirex-flip'
          onClick={() => {
            hapticLight()
            onFlip()
          }}
          style={{ ...circle, cursor: 'pointer' }}
        >
          <ArrowUpDown size={18} />
        </button>
      ) : (
        <span aria-hidden style={circle}>
          <ArrowUpDown size={14} />
        </span>
      )}
    </div>
  )
}

interface ConfirmTransferButtonProps {
  label: string
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  testId?: string
}

export function ConfirmTransferButton({ label, onClick, disabled, loading, testId }: ConfirmTransferButtonProps) {
  const off = disabled || loading
  return (
    <button
      type='button'
      data-testid={testId}
      disabled={off}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        height: 52,
        padding: '0 1rem',
        borderRadius: 12,
        border: 'none',
        background: off ? 'rgba(255, 255, 255, 0.25)' : 'var(--blue-primary)',
        color: 'rgba(16,16,21,1)',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: 1,
        textTransform: 'uppercase',
        cursor: off ? 'default' : 'pointer',
        transition: 'background 0.2s ease',
      }}
    >
      {label}
      <img src='/images/icons/Withdrawal.png' alt='' />
    </button>
  )
}

interface PercentChipsProps {
  onSelect: (percent: number) => void
  disabled?: boolean
  /** data-testid prefix; chips get `${prefix}-${percent}`. */
  testIdPrefix: string
}

const PERCENTAGES = [25, 50, 75, 100]

export function PercentChips({ onSelect, disabled, testIdPrefix }: PercentChipsProps) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {PERCENTAGES.map((pct) => (
        <button
          key={pct}
          type='button'
          data-testid={`${testIdPrefix}-${pct}`}
          disabled={disabled}
          onClick={() => {
            hapticLight()
            onSelect(pct)
          }}
          style={{
            flex: 1,
            height: 36,
            borderRadius: 10,
            border: 'none',
            background: ROW_BG,
            color: 'var(--white)',
            fontSize: 12,
            fontWeight: 600,
            cursor: disabled ? 'default' : 'pointer',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {pct}%
        </button>
      ))}
    </div>
  )
}

export function TransferLayout({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  return (
    <>
      <div
        style={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          gap: '1rem',
          minHeight: 0,
          overflowY: 'auto',
          padding: '0 1rem',
        }}
      >
        {children}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '0.75rem 0.5rem calc(0.5rem + env(safe-area-inset-bottom))',
        }}
      >
        {footer}
      </div>
    </>
  )
}
