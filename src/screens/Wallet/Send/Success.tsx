import { useContext, useEffect, useRef } from 'react'
import { FlowContext } from '../../../providers/flow'
import { NotificationsContext } from '../../../providers/notifications'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { TxResultContext } from '../../../providers/txResult'
import { fromSatoshis, prettyFiatAmount } from '../../../lib/format'
import { ConfigContext } from '../../../providers/config'
import { FiatContext } from '../../../providers/fiat'
import { WalletContext } from '../../../providers/wallet'
import { prettyAssetAmount } from '../../../lib/assets'

export default function SendSuccess() {
  const { config, useFiat } = useContext(ConfigContext)
  const { toFiat } = useContext(FiatContext)
  const { sendInfo } = useContext(FlowContext)
  const { notifyPaymentSent } = useContext(NotificationsContext)
  const { assetMetadataCache } = useContext(WalletContext)
  const { navigate } = useContext(NavigationContext)
  const { notifyResult } = useContext(TxResultContext)

  const isAssetSend = Boolean(sendInfo.assets?.length)
  const assetId = sendInfo.assets?.[0]?.assetId
  const assetMeta = assetId ? assetMetadataCache.get(assetId) : undefined
  const assetTicker = assetMeta?.metadata?.ticker ?? ''
  const assetAmountValue = sendInfo.assets?.[0]?.amount ?? BigInt(0)
  const assetDecimals = assetMeta?.metadata?.decimals ?? 8

  const totalSats = sendInfo.total ?? 0
  const btcAmount = `${fromSatoshis(totalSats).toFixed(8).replace(/\.?0+$/, '')} BTC`
  const displayAmount = isAssetSend
    ? `${prettyAssetAmount(assetAmountValue, assetDecimals)} ${assetTicker}`
    : useFiat
      ? prettyFiatAmount(toFiat(totalSats), config.fiat)
      : btcAmount

  // Fire the sent-payment notification and the success popup exactly once, then
  // redirect home. Navigating to Pages.Wallet is a root navigation that clears
  // the back stack, so the back button won't return to the transaction flow.
  const handled = useRef(false)
  useEffect(() => {
    if (handled.current) return
    handled.current = true
    if (sendInfo.total) notifyPaymentSent(sendInfo.total)
    notifyResult(true, 'Payment sent!', `${displayAmount} sent successfully`).then(() => navigate(Pages.Wallet))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
