import { useContext, useState } from 'react'
import { WalletContext } from '../providers/wallet'
import Text, { TextLabel } from './Text'
import { Fiats, Tx } from '../lib/types'
import { prettyDate, prettyHide } from '../lib/format'
import { FlowContext } from '../providers/flow'
import { NavigationContext, Pages } from '../providers/navigation'
import { ConfigContext } from '../providers/config'
import { FiatContext } from '../providers/fiat'
import Focusable from './Focusable'
import { hapticSubtle } from '../lib/haptics'
import { ASSETS, type AssetSymbol } from '../lib/assets'
import { getTxStatus, TxStatus } from '../lib/txStatus'
import { AspContext } from '../providers/asp'

const LIST_STATUS: Record<TxStatus, { text: string; color: string }> = {
  Settled: { text: 'Confirmed', color: 'var(--green-positive)' },
  Preconfirmed: { text: 'Confirmed', color: 'var(--green-positive)' },
  'Pending boarding': { text: 'Pending', color: 'var(--orange)' },
  Unconfirmed: { text: 'Pending', color: 'var(--orange)' },
  Expired: { text: 'Failed', color: 'var(--red)' },
}

const TransactionLine = ({ tx, onClick }: { tx: Tx; onClick: () => void }) => {
  const { config } = useContext(ConfigContext)
  const { toFiat } = useContext(FiatContext)
  const { aspInfo } = useContext(AspContext)
  const boardingExitDelay = Number(aspInfo?.boardingExitDelay || 0)

  // Convert satoshis to BTC
  const btcAmount = tx.amount / Math.pow(10, ASSETS.BTC.precision)

  const prefix = tx.type === 'sent' ? '-' : '+'

  // Format BTC amount with up to 5 decimal places
  const formattedBTC = config.showBalance
    ? `${prefix} ${btcAmount.toFixed(5)} ${ASSETS.BTC.symbol}`
    : prettyHide(btcAmount, ASSETS.BTC.symbol)

  // Format fiat amount using selected currency
  const fiatAmount = toFiat(tx.amount)
  const fiatSymbol = config.fiat === Fiats.EUR ? '€' : config.fiat === Fiats.CHF ? 'Fr.' : '$'
  const formattedUSD = config.showBalance
    ? `${prefix} ${fiatSymbol}${fiatAmount.toFixed(2)}`
    : prettyHide(fiatAmount, config.fiat)

  const statusText = getTxStatus(tx, boardingExitDelay)
  const status = LIST_STATUS[statusText] ?? { text: statusText, color: 'var(--grey)' }
  const date = tx.createdAt ? prettyDate(tx.createdAt) : 'Unknown date'
  const action = tx.type === 'sent' ? `Sent ${ASSETS.BTC.symbol}` : `Received ${ASSETS.BTC.symbol}`

  const iconSrc = tx.type === 'sent' ? '/images/icons/sent.svg' : '/images/icons/received.svg'
  const iconAlt = tx.type === 'sent' ? 'Sent' : 'Received'

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 16px',
        cursor: 'pointer',
        borderBottom: '1px solid var(--dark10)',
        transition: 'background 0.15s ease',
        width: '100%',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--white03)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      {/* Left Section - Icon */}
      <div style={{ marginRight: '12px' }}>
        <img src={iconSrc} alt={iconAlt} width={24} height={24} style={{ display: 'block' }} />
      </div>

      {/* Middle Section - Date, Action, Status */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ fontSize: '11px', color: 'var(--grey)', fontWeight: 400 }}>{date}</div>
        <div style={{ fontSize: '14px', color: 'white', fontWeight: 500 }}>{action}</div>
        <div style={{ fontSize: '12px', color: status.color, fontWeight: 500 }}>{status.text}</div>
      </div>

      {/* Right Section - Amount */}
      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ fontSize: '14px', color: 'white', fontWeight: 500, fontFamily: 'monospace' }}>{formattedBTC}</div>
        <div style={{ fontSize: '12px', color: 'var(--grey)', fontWeight: 400 }}>{formattedUSD}</div>
      </div>
    </div>
  )
}

export default function TransactionsList({
  filterAsset,
  maxItems,
}: {
  filterAsset?: AssetSymbol | string
  maxItems?: number
}) {
  const { setTxInfo } = useContext(FlowContext)
  const { navigate } = useContext(NavigationContext)
  const { txs } = useContext(WalletContext)

  const [focused, setFocused] = useState(false)

  // Filter transactions by asset if specified
  // Note: Currently all transactions are BTC. When multi-asset support is added,
  // the Tx type should include an 'asset' field for filtering.
  const filteredTxs = filterAsset
    ? txs.filter(() => {
        // For now, assume all transactions are BTC
        // In future: return tx.asset === filterAsset
        return filterAsset === ASSETS.BTC.symbol
      })
    : txs

  // Limit to maxItems if specified
  const displayTxs = maxItems ? filteredTxs.slice(0, maxItems) : filteredTxs
  const hasMore = maxItems && filteredTxs.length > maxItems

  const key = (tx: Tx, index: number) => tx.roundTxid || tx.redeemTxid || tx.boardingTxid || `tx-${index}`

  const focusOnFirstRow = () => {
    setFocused(true)
    if (displayTxs.length === 0) return
    const id = key(displayTxs[0], 0)
    const first = document.getElementById(id) as HTMLElement
    if (first) first.focus()
  }

  const focusOnOuterShell = () => {
    setFocused(false)
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

  const handleViewAll = () => {
    hapticSubtle()
    navigate(Pages.Transactions)
  }

  return (
    <div style={{ marginTop: '1.5rem', width: '100%' }}>
      <div style={{ marginBottom: '8px' }}>
        <TextLabel>{filterAsset ? `${filterAsset} transactions` : 'Recent Transactions'}</TextLabel>
      </div>
      <div
        style={{
          border: '1px solid var(--grey)',
          borderRadius: 'var(--info-container-radius)',
          overflow: 'hidden',
          backgroundColor: 'transparent',
          width: '100%',
        }}
      >
        <Focusable id='outer' onEnter={focusOnFirstRow} ariaLabel={ariaLabel()}>
          <div style={{ width: '100%' }}>
            {displayTxs.map((tx, index) => {
              const k = key(tx, index)
              return (
                <Focusable
                  id={k}
                  key={k}
                  inactive={!focused}
                  onEnter={() => handleClick(tx)}
                  onEscape={focusOnOuterShell}
                  ariaLabel={ariaLabel(tx)}
                >
                  <TransactionLine onClick={() => handleClick(tx)} tx={tx} />
                </Focusable>
              )
            })}
          </div>
        </Focusable>

        {hasMore ? (
          <div
            onClick={handleViewAll}
            style={{
              padding: '12px 16px',
              textAlign: 'center',
              cursor: 'pointer',
              borderTop: '1px solid var(--dark10)',
              transition: 'background 0.15s ease',
              width: '100%',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--white03)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <Text color='blue-primary' thin>
              View all transactions
            </Text>
          </div>
        ) : null}
      </div>
    </div>
  )
}
