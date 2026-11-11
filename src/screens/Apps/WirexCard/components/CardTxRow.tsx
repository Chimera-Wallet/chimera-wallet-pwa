import { Download, Repeat, Upload } from 'lucide-react'
import { prettyNumber } from '../../../../lib/format'
import { WirexCardTx, WirexCardTxType } from '../lib'

const ICONS: Record<WirexCardTxType, JSX.Element> = {
  withdraw: <Upload size={16} />,
  deposit: <Download size={16} />,
  swap: <Repeat size={16} />,
}

const STATUS_COLOR: Record<WirexCardTx['status'], string> = {
  Confirmed: 'var(--green)',
  Pending: 'var(--orange)',
  Failed: 'var(--red)',
}

const formatDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()

const signed = (n: number, decimals: number) => `${n >= 0 ? '+' : '-'}${prettyNumber(Math.abs(n), decimals)}`

/** One card transaction row, matching the design's list (icon, date, title, status badge, amounts). */
export default function CardTxRow({ tx }: { tx: WirexCardTx }) {
  return (
    <div
      data-testid='wirex-card-tx'
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 0',
        borderBottom: '1px solid var(--dark10)',
      }}
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
        <span style={{ fontSize: 14, fontWeight: 600 }}>{tx.title}</span>
        <span
          style={{
            alignSelf: 'flex-start',
            fontSize: 9,
            fontWeight: 600,
            padding: '1px 4px',
            borderRadius: 3,
            textTransform: 'uppercase',
            color: STATUS_COLOR[tx.status],
            border: `1px solid ${STATUS_COLOR[tx.status]}`,
          }}
        >
          {tx.status}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
        <span
          style={{
            fontSize: 13,
            fontFamily: 'Geist Mono, monospace',
            color: tx.amount >= 0 ? 'var(--green)' : 'var(--red)',
          }}
        >
          {signed(tx.amount, 8)} {tx.currency}
        </span>
        {tx.fiatAmount !== undefined ? (
          <span style={{ fontSize: 11, color: 'var(--grey)', fontFamily: 'Geist Mono, monospace' }}>
            {prettyNumber(Math.abs(tx.fiatAmount), 2, true, 2)}
          </span>
        ) : null}
      </div>
    </div>
  )
}
