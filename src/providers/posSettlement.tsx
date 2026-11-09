/**
 * Settles POS sales in the background, whatever screen is showing.
 *
 * The payment QR screen only displays a sale; this matches incoming funds to
 * open sales (lib/pos::settlePosIncoming), so a customer who pays after the
 * merchant closed the QR still lands in the payment history and its export,
 * and fiat sales still get converted. It also expires sales whose window has
 * passed and picks up conversions an earlier session didn't finish.
 */

import { useContext, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../components/Toast'
import { useIncomingPayments } from '../hooks/useIncomingPayments'
import { prettyFiatAmount } from '../lib/format'
import { expirePosSales, isFiatPayout, settlePosIncoming } from '../lib/pos'
import { convertPosPayment, resumePosConversions } from '../lib/posConversion'
import type { Fiats } from '../lib/types'
import { AspContext } from './asp'
import { NotificationsContext } from './notifications'
import { WalletContext } from './wallet'

const HOUSEKEEPING_INTERVAL_MS = 60_000

export default function PosSettlement() {
  const { svcWallet } = useContext(WalletContext)
  const { aspInfo } = useContext(AspContext)
  const { notifyPaymentReceived } = useContext(NotificationsContext)
  const { toast } = useToast()
  const { t } = useTranslation()

  const signerPubkey = aspInfo.signerPubkey

  useIncomingPayments(svcWallet, ({ sats, spentSats }) => {
    // Only funds arriving from outside count. A batch renewal or an outgoing
    // payment also reports new coins, but spends the wallet's own to make them.
    const sale = settlePosIncoming(sats - spentSats)
    if (!sale) return

    const received = sale.receivedSats ?? sale.sats
    notifyPaymentReceived(received)
    toast(t('apps.pos.settledToast', { amount: prettyFiatAmount(sale.fiatAmount, sale.fiatCurrency as Fiats) }))
    if (svcWallet && isFiatPayout(sale.payoutCurrency)) convertPosPayment(sale.id, { svcWallet, signerPubkey })
  })

  useEffect(() => {
    if (!svcWallet) return
    const housekeeping = () => {
      expirePosSales()
      resumePosConversions({ svcWallet, signerPubkey })
    }
    housekeeping()
    const timer = setInterval(housekeeping, HOUSEKEEPING_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [svcWallet, signerPubkey])

  return null
}
