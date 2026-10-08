import { useEffect, useRef } from 'react'
import type { ServiceWorkerWallet } from '@arkade-os/sdk'
import { parseIncomingPayment, type IncomingPayment } from '../lib/incomingPayment'

/**
 * Call `onPayment` for every payment the wallet's service worker reports
 * (new VTXOs or boarding UTXOs) while the calling screen is mounted.
 *
 * The latest `onPayment` is always used, so callers don't need to memoise it
 * and never act on stale state.
 */
export function useIncomingPayments(
  svcWallet: ServiceWorkerWallet | undefined,
  onPayment: (payment: IncomingPayment) => void,
) {
  const callback = useRef(onPayment)
  callback.current = onPayment

  useEffect(() => {
    if (!svcWallet) return

    const listener = (event: MessageEvent) => {
      const payment = parseIncomingPayment(event.data)
      if (payment) callback.current(payment)
    }

    navigator.serviceWorker.addEventListener('message', listener)
    return () => navigator.serviceWorker.removeEventListener('message', listener)
  }, [svcWallet])
}
