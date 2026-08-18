import { useContext, useEffect, useRef, useState } from 'react'
import { NotificationsContext } from '../../../providers/notifications'
import { FlowContext } from '../../../providers/flow'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { WalletContext } from '../../../providers/wallet'
import { TxResultContext } from '../../../providers/txResult'
import { ConfigContext } from '../../../providers/config'
import { FiatContext } from '../../../providers/fiat'
import { consoleError } from '../../../lib/logs'
import { prettyAmount, prettyFiatAmount } from '../../../lib/format'
import type { AssetDetails } from '@arkade-os/sdk'
import { prettyAssetAmount } from '../../../lib/assets'
import { useTranslation } from 'react-i18next'

export default function ReceiveSuccess() {
  const { config, useFiat } = useContext(ConfigContext)
  const { toFiat } = useContext(FiatContext)
  const { recvInfo } = useContext(FlowContext)
  const { notifyPaymentReceived } = useContext(NotificationsContext)
  const { assetMetadataCache, setCacheEntry, svcWallet } = useContext(WalletContext)
  const { navigate } = useContext(NavigationContext)
  const { notifyResult } = useContext(TxResultContext)

  const receivedAssets = recvInfo.receivedAssets ?? []
  const isAssetReceive = receivedAssets.length > 0

  const [assetDetails, setAssetDetails] = useState<Map<string, AssetDetails>>(() => {
    const entries: [string, AssetDetails][] = []
    for (const a of receivedAssets) {
      const cached = assetMetadataCache.get(a.assetId)
      if (cached) entries.push([a.assetId, cached])
    }
    return new Map(entries)
  })
  
  const {t} = useTranslation()

  // Fetch and cache asset metadata if not already cached (used for the notification label)
  useEffect(() => {
    if (!receivedAssets.length || !svcWallet || assetDetails.size === receivedAssets.length) return

    for (const a of receivedAssets) {
      if (assetDetails.has(a.assetId)) continue
      svcWallet.assetManager
        .getAssetDetails(a.assetId)
        .then((details) => {
          if (details) {
            const moderated = setCacheEntry(a.assetId, details)
            setAssetDetails((prev) => new Map([...prev, [a.assetId, moderated]]))
          }
        })
        .catch((err) => consoleError(err, 'error fetching asset details'))
    }
  }, [receivedAssets, svcWallet])

  // Notify once all metadata is loaded (or immediately for non-asset receives)
  const notified = useRef(false)
  useEffect(() => {
    if (notified.current) return
    if (isAssetReceive) {
      if (assetDetails.size < receivedAssets.length) return
      const labels = receivedAssets.map((a) => {
        const meta = assetDetails.get(a.assetId)?.metadata
        const amount = prettyAssetAmount(a.amount, meta?.decimals ?? 0)
        const ticker = meta?.ticker ?? meta?.name ?? 'assets'
        return `${amount} ${ticker}`
      })
      notified.current = true
      notifyPaymentReceived(recvInfo.satoshis, labels.join(', '))
    } else {
      notified.current = true
      notifyPaymentReceived(recvInfo.satoshis)
    }
  }, [assetDetails])

  // Show the success popup once, then redirect home. Navigating to Pages.Wallet
  // is a root navigation that clears the back stack, so the back button won't
  // return to the receive flow.
  const displayAmount = useFiat
    ? prettyFiatAmount(toFiat(recvInfo.satoshis), config.fiat)
    : prettyAmount(recvInfo.satoshis)

  const handled = useRef(false)
  useEffect(() => {
    if (handled.current) return
    handled.current = true
    const detail = isAssetReceive ? undefined : t('common.notifications.receive.bank.successAmount', {amount: displayAmount})
    notifyResult(true, t('common.notifications.receive.paymentReceived'), detail).then(() => navigate(Pages.Wallet))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
