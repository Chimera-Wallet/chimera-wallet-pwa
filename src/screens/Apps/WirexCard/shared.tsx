import { CSSProperties, ReactNode } from 'react'
import { ArrowUpDown, ChevronDown, CreditCard, Download, Repeat } from 'lucide-react'
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
   * Corner radius. Defaults to the Figma corner (16 on the 326×206 card) as a
   * percentage of width / height, so it scales with the card.
   */
  radius?: number | string
  /** When set, renders the frozen look (Figma "Card / Frozen"): frosted overlay plus this label in a centred badge. */
  frozenLabel?: string
  style?: CSSProperties
}

/** Figma "Card / Chimera Visa / Front" artwork (blue card, strips, Debit, VISA Platinum). */
export const CARD_ART_SRC = '/images/card/card-art.svg'

// Figma: blue glow drop shadow on the Card screen; pale blue when frozen.
const ACTIVE_SHADOW = 'drop-shadow(0 10px 20px rgba(31, 59, 219, 0.6))'
const FROZEN_SHADOW = 'drop-shadow(0 10px 20px rgba(140, 191, 255, 0.35))'

// Text sizes are authored against the 326px-wide Figma card and expressed in
// container units, so they scale with whatever width the card is given.
const u = (px: number) => `${(px / 326) * 100}cqw`

/** Figma "Badge / Frozen": snowflake + label in a dark pill. Fixed size, not scaled with the card. */
export function FrozenBadge({ label, style }: { label: string; style?: CSSProperties }) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 14px 6px 12px',
        borderRadius: 16,
        background: 'rgba(0, 0, 0, 0.6)',
        color: '#fff',
        fontFamily: 'Titillium Web, sans-serif',
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 'normal',
        letterSpacing: 0.96,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <img src='/images/icons/Snowflake.svg' alt='' width={16} height={16} />
      {label}
    </span>
  )
}

/** Blue "Debit / VISA Platinum" card (Card walkthrough + card home), with the last four digits overlaid. */
export function CardArt({ width = 326, last4, radius = '4.91% / 7.77%', frozenLabel, style }: CardArtProps) {
  const frozen = frozenLabel !== undefined
  return (
    <div
      aria-hidden
      style={{
        position: 'relative',
        width,
        aspectRatio: '326 / 206',
        flexShrink: 0,
        filter: frozen ? FROZEN_SHADOW : ACTIVE_SHADOW,
        transition: 'filter 0.3s ease',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radius,
          overflow: 'hidden',
          containerType: 'inline-size',
        }}
      >
        <img
          src={CARD_ART_SRC}
          alt=''
          draggable={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
        />
        <span
          style={{
            position: 'absolute',
            left: u(20),
            top: `${(176 / 206) * 100}%`,
            fontFamily: "'Space Mono', 'Geist Mono', monospace",
            fontSize: u(12),
            lineHeight: 'normal',
            letterSpacing: u(1.44),
            color: 'rgba(255, 255, 255, 0.85)',
            whiteSpace: 'nowrap',
          }}
        >
          •• {last4 ?? '••••'}
        </span>
        {frozen ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(199, 222, 255, 0.3)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
            }}
          />
        ) : null}
      </div>
      {frozen ? (
        <FrozenBadge
          label={frozenLabel}
          style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        />
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

export function ActionTile({ icon, label, onClick, disabled, testId, iconBackground = '#000' }: ActionTileProps) {
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
        flex: '0 1 auto',
        minWidth: 52,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: 0,
        border: 'none',
        background: 'none',
        color: '#fff',
        fontFamily: 'inherit',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <span
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: iconBackground,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.3s ease',
        }}
      >
        {icon}
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          lineHeight: 'normal',
          textTransform: 'uppercase',
          letterSpacing: 0.88,
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
  deposit: <Download size={18} />,
  payment: <CreditCard size={18} />,
  withdraw: <ArrowUpDown size={18} />,
  swap: <Repeat size={18} />,
}

/** Figma text colours without a matching token. */
export const GREY_MEDIUM = '#9b9ca6'
export const GREY_LIGHT = '#ced0dd'
const GREEN = '#16bf5a'

const STATUS_STYLE: Record<WirexCardTx['status'], { color: string; background: string }> = {
  Confirmed: { color: GREEN, background: 'rgba(22, 191, 90, 0.2)' },
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
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 64,
        padding: '0 16px',
        boxSizing: 'border-box',
      }}
    >
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: '#000',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {ICONS[tx.type]}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 10, lineHeight: '10px', color: GREY_MEDIUM }}>{formatDate(tx.date)}</span>
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            lineHeight: '16px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {tx.title}
        </span>
        <span
          style={{
            alignSelf: 'flex-start',
            fontSize: 8,
            fontWeight: 600,
            lineHeight: 'normal',
            padding: '1px 6px',
            borderRadius: 4,
            textTransform: 'uppercase',
            ...status,
          }}
        >
          {tx.status}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
        <span style={{ fontSize: 12, lineHeight: '16px', color: primary >= 0 ? GREEN : '#fff' }}>
          {signed(primary)} {primaryCurrency}
        </span>
        {showSecondary ? (
          <span style={{ fontSize: 10, lineHeight: '14px', color: GREY_MEDIUM }}>
            {prettyNumber(Math.abs(tx.amount), 8)} {tx.currency}
          </span>
        ) : null}
      </div>
    </div>
  )
}

// Transfer screens (Figma "03 Panel Card SWAP")

const ROW_BG = 'var(--info-container-bg2)' // #25252a
const CHIP_BG = '#2c2c2e'
const MAIN_BG = '#101015'

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

/** Figma "Amount / Input": SemiBold 38 number + Regular 18 unit on one baseline, counter-value underneath. */
export function TransferAmount({ value, onChange, unit, hint, disabled, testId, ariaLabel }: TransferAmountProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2px 0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4, maxWidth: '100%' }}>
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
            caretColor: 'var(--blue-primary)',
            fontFamily: 'inherit',
            fontSize: 38,
            fontWeight: 600,
            lineHeight: '38px',
            textAlign: 'center',
            padding: 0,
          }}
        />
        <span style={{ fontSize: 18, lineHeight: 'normal' }}>{unit}</span>
      </div>
      {hint ? <span style={{ fontSize: 12, lineHeight: '16px', color: 'var(--white)' }}>{hint}</span> : null}
    </div>
  )
}

/** The card's row icon (Figma): a 40px rounded-square outline holding the bank glyph. */
export const CardRowIcon = () => (
  <span
    style={{
      width: 40,
      height: 40,
      borderRadius: 10,
      border: '1px solid rgba(255, 255, 255, 0.16)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      boxSizing: 'border-box',
    }}
  >
    <img src='/images/card/bank.svg' alt='' width={20} height={20} />
  </span>
)

interface TransferRowProps {
  icon: ReactNode
  /** Small uppercase caption, e.g. "From card". */
  label: string
  /** Main line, e.g. "Card 15,456.78 USD". */
  title: string
  /** Makes the row a picker (shows a chevron). */
  onClick?: () => void
  testId?: string
}

export function TransferRow({ icon, label, title, onClick, testId }: TransferRowProps) {
  const content = (
    <>
      {icon}
      <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, textAlign: 'left' }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            lineHeight: '16px',
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: GREY_MEDIUM,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            lineHeight: '16px',
            letterSpacing: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
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
    gap: 8,
    width: '100%',
    height: 64,
    padding: '8px 12px',
    borderRadius: 20,
    border: 'none',
    background: ROW_BG,
    color: '#fff',
    fontFamily: 'inherit',
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

/** The FROM and TO rows stacked, with the Figma "Switch" button over the gap (static when `onFlip` is absent). */
export function TransferRows({ from, to, onFlip }: { from: ReactNode; to: ReactNode; onFlip?: () => void }) {
  const circle: CSSProperties = {
    position: 'absolute',
    top: 48,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: 8,
    borderRadius: 20,
    border: `4px solid ${ROW_BG}`,
    background: MAIN_BG,
    display: 'flex',
    zIndex: 1,
  }
  const icon = <img src='/images/icons/Vertical.png' alt='' width={24} height={24} />
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
          {icon}
        </button>
      ) : (
        <span aria-hidden style={circle}>
          {icon}
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
        height: 48,
        padding: '12px 16px',
        borderRadius: 16,
        border: 'none',
        background: off ? 'rgba(255, 255, 255, 0.25)' : 'var(--blue-primary)',
        color: MAIN_BG,
        fontFamily: 'inherit',
        fontSize: 14,
        fontWeight: 600,
        lineHeight: '16px',
        letterSpacing: 1,
        textTransform: 'uppercase',
        cursor: off ? 'default' : 'pointer',
        transition: 'background 0.2s ease',
      }}
    >
      {label}
      <img src='/images/icons/Withdrawal.png' alt='' width={16} height={16} style={{ opacity: 0.5 }} />
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

/** Figma "Amount Shortcuts". */
export function PercentChips({ onSelect, disabled, testIdPrefix }: PercentChipsProps) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
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
            minWidth: 0,
            height: 37,
            padding: '0 8px',
            borderRadius: 16,
            border: 'none',
            background: CHIP_BG,
            color: GREY_LIGHT,
            fontFamily: 'inherit',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 1,
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

/**
 * Figma lays the transfer panel out as one column under the app bar (amount,
 * From/To, CONFIRM TRANSFER, shortcuts) with the numeric keyboard below, so the
 * footer follows the content instead of being pinned to the bottom. `notes`
 * (fees, progress, errors) go underneath, outside the designed panel.
 */
export function TransferLayout({
  children,
  footer,
  notes,
}: {
  children: ReactNode
  footer: ReactNode
  notes?: ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        gap: 12,
        minHeight: 0,
        overflowY: 'auto',
        padding: '0 16px calc(16px + env(safe-area-inset-bottom))',
      }}
    >
      {children}
      {footer}
      {notes}
    </div>
  )
}
