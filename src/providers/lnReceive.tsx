/**
 * Owns the `RfqSwapManager` that drives Lightning-receive lockups to a claim.
 *
 * Mounted once at app root rather than per-screen: the manager persists every
 * swap through `assetSwapRepository` and restores + restarts monitoring at
 * boot (`restoreFromRepository` + `start`), so a receive negotiated before a
 * reload or a backgrounded tab still gets claimed once the solver funds it —
 * the receive screens no longer poll for that themselves. See `lib/lnReceive.ts`
 * for why that matters here specifically: unlike a Lightning send, a receive
 * has no "fund and forget" step, and an unclaimed lockup is lost to the
 * solver's refund, not returned to this wallet.
 */
import { ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react'
import { RestArkProvider, type NetworkName } from '@arkade-os/sdk'
import { RfqSwapManager, type AvailableRfqSwapManagerCallbacks } from '@arkade-os/swap'
import { AspContext } from './asp'
import { WalletContext } from './wallet'
import { assetSwapRepository } from '../lib/swapRepository'
import { Indexer } from '../lib/indexer'
import { getEmulatorPubkeyForNetwork } from '../lib/constants'
import { discoverMarkets } from '../lib/swapMarkets'
import { lnReceiveRendezvous } from '../lib/lnSwap'
import { withRfqTransport } from '../lib/nostrRfq'
import {
  requestLnReceive,
  buildLightningReceiveSwap,
  buildLightningReceiveOrigin,
  claimLightningReceive,
  type LnReceiveRequest,
} from '../lib/lnReceive'
import { prettyNumber } from '../lib/format'
import { consoleError } from '../lib/logs'
import { discover } from '@arkade-os/solver-discovery'

/** What a receive screen needs to show — the manager owns everything else
 * (secrets, the covenant script, claim state) from here on. */
export interface LnReceiveInvoice {
  rfqId: string
  invoice: string
  payAmount: number
  expectedAmount: number
  invoiceExpiresAt: number
}

interface LnReceiveContextProps {
  /** True once the manager has restored its stored swaps and is polling —
   * `requestReceive` throws before this. */
  ready: boolean
  requestReceive: (amountSats: number) => Promise<LnReceiveInvoice>
}

export const LnReceiveContext = createContext<LnReceiveContextProps>({
  ready: false,
  requestReceive: async () => {
    throw new Error('lightning receive not initialized')
  },
})

export const LnReceiveProvider = ({ children }: { children: ReactNode }) => {
  const { aspInfo } = useContext(AspContext)
  const { svcWallet } = useContext(WalletContext)

  const [ready, setReady] = useState(false)
  const managerRef = useRef<RfqSwapManager>()

  // Rebuilt on every wallet/network change, like `assetSwaps.tsx`'s watcher:
  // the manager's deps (the indexer, the contract manager) are bound to one
  // ark server, and a stale instance must not keep polling after a switch.
  useEffect(() => {
    setReady(false)
    managerRef.current = undefined
    if (!svcWallet || !aspInfo.url || !aspInfo.network) return

    let cancelled = false
    const ark = new RestArkProvider(aspInfo.url)
    const indexer = new Indexer(aspInfo).provider

    const setup = async () => {
      const contracts = await svcWallet.getContractManager()
      if (cancelled) return
      const manager = new RfqSwapManager({ indexer, contracts, repository: assetSwapRepository })
      const callbacks: AvailableRfqSwapManagerCallbacks = {
        claimLockup: claimLightningReceive(svcWallet, ark, assetSwapRepository),
        // Required by the type — it is generic over every RfqSwap kind — but
        // this manager only ever monitors `lightning_receive` swaps, which
        // have no trader-side refund leaf at all, so the manager never calls
        // this in practice.
        refundArkade: async () => {
          throw new Error('refundArkade is unreachable: this manager only monitors lightning_receive swaps')
        },
      }
      manager.setCallbacks(callbacks)
      await manager.restoreFromRepository()
      if (cancelled) return
      await manager.start()
      if (cancelled) {
        manager.stop().catch((err) => consoleError(err, 'failed to stop abandoned lightning receive manager'))
        return
      }
      managerRef.current = manager
      setReady(true)
    }
    setup().catch((err) => consoleError(err, 'failed to start lightning receive manager'))

    return () => {
      cancelled = true
      managerRef.current?.stop().catch((err) => consoleError(err, 'failed to stop lightning receive manager'))
      managerRef.current = undefined
      setReady(false)
    }
  }, [svcWallet, aspInfo.url, aspInfo.network])

  const requestReceive = async (amountSats: number): Promise<LnReceiveInvoice> => {
    const manager = managerRef.current
    if (!svcWallet || !manager) throw new Error('lightning receive service unavailable')
    const network = aspInfo.network as NetworkName
    console.log(network)
    console.log(getEmulatorPubkeyForNetwork(network))
    console.log(await discoverMarkets(network))
    const rendezvous = lnReceiveRendezvous(await discoverMarkets(network), getEmulatorPubkeyForNetwork(network))
    if (!rendezvous) throw new Error('No Lightning solver available')
    if (amountSats < rendezvous.minSats || amountSats > rendezvous.maxSats) {
      throw new Error(`Amount outside solver bounds (${prettyNumber(rendezvous.minSats)}-${prettyNumber(rendezvous.maxSats)} sats)`)
    }
    const request: LnReceiveRequest = await withRfqTransport(rendezvous, (transport) =>
      requestLnReceive({
        wallet: svcWallet,
        arkServerUrl: aspInfo.url,
        transport,
        rendezvous,
        network,
        amountSats,
      }),
    )
    const nowSeconds = Math.floor(Date.now() / 1000)
    // Persist BEFORE returning the invoice to the caller: once shown, a payer
    // may pay it at any moment, and an unpersisted swap is a claim this wallet
    // cannot recover from if the tab closes before the solver funds it.
    await manager.addSwap(buildLightningReceiveSwap(request, nowSeconds), buildLightningReceiveOrigin(request))
    return {
      rfqId: request.rfqId,
      invoice: request.invoice,
      payAmount: request.payAmount,
      expectedAmount: request.expectedAmount,
      invoiceExpiresAt: request.invoiceExpiresAt,
    }
  }

  return <LnReceiveContext.Provider value={{ ready, requestReceive }}>{children}</LnReceiveContext.Provider>
}
