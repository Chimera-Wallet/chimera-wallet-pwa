import { useContext, useRef } from 'react'
import { WalletContext } from '../providers/wallet'
import { TextLabel, TextSecondary } from './Text'
import { Tx } from '../lib/types'
import { fromSatoshis, prettyDate, prettyFiatAmount, prettyFiatHide, prettyHide } from '../lib/format'
import { FlowContext } from '../providers/flow'
import { NavigationContext, Pages } from '../providers/navigation'
import { ConfigContext } from '../providers/config'
import { FiatContext } from '../providers/fiat'
import Focusable from './Focusable'
import { hapticSubtle } from '../lib/haptics'
import { ASSETS } from '../lib/assets'
import { getTxStatus, TxStatus } from '../lib/txStatus'
import { AspContext } from '../providers/asp'
import { useTranslation } from 'react-i18next'

const STATUS_STYLE: Record<TxStatus, { text: string; color: string }> = {
  Settled: { text: 'lib.transactions.confirmed', color: 'var(--green)' },
  Preconfirmed: { text: 'lib.transactions.confirmed', color: 'var(--green)' },
  'Pending boarding': { text: 'lib.transactions.pending', color: 'var(--orange)' },
  Unconfirmed: { text: 'lib.transactions.pending', color: 'var(--orange)' },
  Expired: { text: 'lib.transactions.failed', color: 'var(--red)' },
}

const TransactionLine = ({ tx, onClick, isFirst }: { tx: Tx; onClick: () => void; isFirst?: boolean }) => {
  const { config } = useContext(ConfigContext)
  const { toFiat } = useContext(FiatContext)
  const { aspInfo } = useContext(AspContext)
  const boardingExitDelay = Number(aspInfo?.boardingExitDelay || 0)

  const {t} = useTranslation()

  const prefix = tx.type === 'sent' ? '-' : '+'
  const btcAmount = fromSatoshis(tx.amount)
  const formattedBTC = config.showBalance
    ? `${prefix} ${btcAmount.toFixed(5)} ${ASSETS.BTC.symbol}`
    : prettyHide(btcAmount, ASSETS.BTC.symbol)

  const fiatValue = toFiat(tx.amount)
  const formattedFiat = config.showBalance
    ? `${prefix} ${prettyFiatAmount(fiatValue, config.fiat)}`
    : prettyFiatHide(fiatValue, config.fiat)

  const statusKey = getTxStatus(tx, boardingExitDelay)
  const status = STATUS_STYLE[statusKey] ?? { text: statusKey, color: 'var(--grey)' }
  const date = tx.createdAt ? prettyDate(tx.createdAt) : 'Unknown date'
  const action = tx.type === 'sent' ? t('lib.transactions.sentAss', {ass: ASSETS.BTC.symbol}) : t('lib.transactions.rcvAss', {ass: ASSETS.BTC.symbol})

  const iconSrc = tx.type === 'sent' ? '/images/icons/sent.svg' : '/images/icons/received.svg'
  const iconAlt = tx.type === 'sent' ? 'Sent' : 'Received'

  return (
    <div
      onClick={onClick}
      data-testid='tx-row'
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 16px',
        cursor: 'pointer',
        borderTop: isFirst ? 'none' : '1px solid var(--neutral-100)',
        transition: 'background 0.15s ease',
        width: '100%',
        boxSizing: 'border-box',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--neutral-50)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      {/* Icon */}
      <div style={{ marginRight: '12px', flexShrink: 0 }}>
        <img src={iconSrc} alt={iconAlt} width={24} height={24} style={{ display: 'block' }} />
      </div>

      {/* Date / Action / Status */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
        <div style={{ fontSize: '11px', color: 'var(--neutral-500)', fontWeight: 400 }}>{date}</div>
        <div style={{ fontSize: '14px', fontWeight: 500 }}>{action}</div>
        <div style={{ fontSize: '12px', color: status.color, fontWeight: 500 }}>{t(status.text)}</div>
      </div>

      {/* Amounts */}
      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 500, fontFamily: 'Geist Mono, monospace' }}>{formattedBTC}</div>
        <div style={{ fontSize: '12px', color: 'var(--neutral-500)', fontWeight: 400 }}>{formattedFiat}</div>
      </div>
    </div>
  )
}

export default function TransactionsList({
  filterAsset,
  maxItems,
}: {
  filterAsset?: string
  maxItems?: number
} = {}) {
  const { setTxInfo } = useContext(FlowContext)
  const { navigate } = useContext(NavigationContext)
  const { txs: allTxs } = useContext(WalletContext)
  const {t} = useTranslation()

  const txs = (() => {
    let list = allTxs
    if (filterAsset) {
      list = list.filter(
        (tx) => tx.assets?.some((a) => a.assetId === filterAsset) || (!tx.assets?.length && filterAsset === 'BTC'),
      )
    }
    if (typeof maxItems === 'number') {
      list = list.slice(0, maxItems)
    }
    return list
  })()

  const focusedRef = useRef(false)
  const focusedIndexRef = useRef(0)

  const key = (tx: Tx, index: number) =>
    [tx.roundTxid, tx.redeemTxid, tx.boardingTxid].filter(Boolean).join('-') || `tx-${index}`

  const focusRow = (index: number) => {
    if (index < 0 || index >= txs.length) return
    focusedIndexRef.current = index
    requestAnimationFrame(() => {
      const el = document.getElementById(key(txs[index], index)) as HTMLElement
      if (el) el.focus()
    })
  }

  const focusOnFirstRow = () => {
    if (txs.length === 0) return
    focusedRef.current = true
    focusRow(0)
  }

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (!focusedRef.current) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusRow(Math.min(focusedIndexRef.current + 1, txs.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusRow(Math.max(focusedIndexRef.current - 1, 0))
    }
  }

  const focusOnOuterShell = () => {
    focusedRef.current = false
    const outer = document.getElementById('outer') as HTMLElement
    if (outer) outer.focus()
  }

  const ariaLabel = (tx?: Tx) => {
    if (!tx) return 'Pressing Enter enables keyboard navigation of the transaction list'
    return `Transaction ${tx.type} of amount ${tx.amount}. Press Escape to exit keyboard navigation.`
  }

  const handleClick = (tx: Tx) => {
    hapticSubtle()
    setTxInfo(tx)
    navigate(Pages.Transaction)
  }

  const label = filterAsset ? `${filterAsset} transactions` : t('lib.transactions.recent')

  const containerStyle: React.CSSProperties = {
    border: '1px solid var(--neutral-200)',
    borderRadius: '0.5rem',
    overflow: 'hidden',
    width: '100%',
  }

  return (
    <div style={{ marginTop: '1rem', width: '100%' }}>
      <div style={{ marginBottom: '8px' }}>
        <TextLabel>{label}</TextLabel>
      </div>
      <div style={containerStyle}>
        <Focusable id='outer' onEnter={focusOnFirstRow} ariaLabel={ariaLabel()}>
          <div onKeyDown={handleListKeyDown}>
            {txs.map((tx, index) => {
              const k = key(tx, index)
              return (
                <Focusable
                  key={k}
                  id={k}
                  inactive={!focusedRef.current}
                  onEnter={() => handleClick(tx)}
                  onEscape={focusOnOuterShell}
                  ariaLabel={ariaLabel(tx)}
                >
                  <TransactionLine onClick={() => handleClick(tx)} tx={tx} isFirst={index === 0} />
                </Focusable>
              )
            })}
          </div>
        </Focusable>
      </div>
    </div>
  )
}
