import { ReactNode, useSyncExternalStore } from 'react'
import AssetAvatar from '../../../components/AssetAvatar'
import Focusable from '../../../components/Focusable'
import Text, { TextSecondary } from '../../../components/Text'
import ArrowIcon from '../../../icons/Arrow'
import { fromSatoshis, prettyFiatAmount, prettyNumber } from '../../../lib/format'
import { hapticSubtle } from '../../../lib/haptics'
import {
  getPosPayment,
  subscribePosPayments,
  type PosMethod,
  type PosOutcome,
  type PosPayment,
  type PosPayoutCurrency,
} from '../../../lib/pos'
import { TRANSFER_METHOD } from '../../../lib/transferMethods'
import type { Fiats } from '../../../lib/types'

/** i18n key for a payout currency's display name. */
export const payoutCurrencyName = (currency: PosPayoutCurrency): string =>
  `apps.pos.payout.${currency === 'BTC' ? 'btc' : currency.toLowerCase()}`

export const methodName = (method: PosMethod): string =>
  method === TRANSFER_METHOD.lightning ? 'apps.pos.method.lightning' : 'apps.pos.method.ark'

/** i18n key for a sale's outcome, as listed in the history. */
export const outcomeName: Record<PosOutcome, string> = {
  completed: 'apps.pos.history.paid',
  failed: 'apps.pos.history.failed',
  pending: 'apps.pos.history.converting',
}

/** "0.00012345 BTC" */
export const btcAmount = (sats: number): string => `${prettyNumber(fromSatoshis(sats), 8)} BTC`

/** The sale's fiat value, as fixed when it was made. */
export const paymentFiat = (payment: PosPayment): string =>
  prettyFiatAmount(payment.fiatAmount, payment.fiatCurrency as Fiats)

/** Round logo for a payout currency (BTC uses the shared asset logo). */
export function CurrencyLogo({ currency, size = 40 }: { currency: PosPayoutCurrency; size?: number }) {
  const icon = currency === 'BTC' ? '/images/asset_logos/BTC.svg' : `/images/currency_logos/${currency}.svg`
  return <AssetAvatar icon={icon} name={currency} size={size} />
}

interface PosRowProps {
  icon?: ReactNode
  label: string
  detail?: string
  onClick: () => void
  testId?: string
}

/** Rounded selectable row, as on the payout currency and POS settings screens. */
export function PosRow({ icon, label, detail, onClick, testId }: PosRowProps) {
  const handleClick = () => {
    hapticSubtle()
    onClick()
  }
  return (
    <Focusable onEnter={handleClick} ariaLabel={label}>
      <div
        onClick={handleClick}
        data-testid={testId}
        style={{
          alignItems: 'center',
          backgroundColor: 'var(--surface)',
          borderRadius: '2.5rem',
          cursor: 'pointer',
          display: 'flex',
          gap: '0.875rem',
          minHeight: 64,
          padding: '0.75rem 1.25rem 0.75rem 0.75rem',
          width: '100%',
        }}
      >
        {icon}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <Text medium>{label}</Text>
          {detail ? <TextSecondary>{detail}</TextSecondary> : null}
        </div>
        <span style={{ color: 'var(--neutral-500)', display: 'flex' }}>
          <ArrowIcon />
        </span>
      </div>
    </Focusable>
  )
}

/** A stored POS payment, kept in sync with background updates (e.g. a finishing conversion). */
export const usePosPayment = (paymentId: string | undefined): PosPayment | undefined =>
  useSyncExternalStore(subscribePosPayments, () => (paymentId ? getPosPayment(paymentId) : undefined))
