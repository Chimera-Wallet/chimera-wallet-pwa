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
 *
 * Which is also why only ONE tab may drive it. The records live in shared
 * IndexedDB, so every open tab would otherwise restore every swap and race
 * the others to claim it — two `pushClaim`s over the same VTXOs, one landing,
 * the other failing as a double-spend. The manager's own guards are
 * per-instance and say nothing about a second one, so the coordination below
 * is a Web Lock.
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
  LnReceiveHeldElsewhere,
  type LnReceiveRequest,
} from '../lib/lnReceive'
import { prettyNumber } from '../lib/format'
import { consoleError } from '../lib/logs'

/** One name per origin, so two tabs of this wallet contend and a tab of an
 * unrelated origin cannot. */
const MANAGER_LOCK = 'lnreceive-manager'

/**
 * How long `requestReceive` gives THIS tab's own lock request before it
 * concludes the holder is someone else.
 *
 * Pending on the lock says nothing on its own about who holds it: this tab's
 * request is pending too in the moments before it is granted, and "another
 * tab is handling Lightning receives" would be a lie told to the only tab
 * open. The window that can actually bite is a remount — `svcWallet` changes
 * identity on reinit and unlock — where the request queues behind this same
 * tab's previous drive while it stops its manager. A grant that is coming
 * lands well inside this; one that is not was never ours to wait for. It does
 * NOT bound how long `manager.start()` itself may take — once granted, the
 * caller awaits that promise directly, however long it takes.
 */
const LOCK_GRACE_MS = 500

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
  const managerRef = useRef<Promise<RfqSwapManager>>()
  const grantedRef = useRef<Promise<void>>()

  // Rebuilt on every wallet/network change, like `assetSwaps.tsx`'s watcher:
  // the manager's deps (the indexer, the contract manager) are bound to one
  // ark server, and a stale instance must not keep polling after a switch.
  useEffect(() => {
    setReady(false)
    managerRef.current = undefined
    if (!svcWallet || !aspInfo.url || !aspInfo.network) return

    let stopped = false
    const ark = new RestArkProvider(aspInfo.url)
    const indexer = new Indexer(aspInfo).provider

    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let grant = () => {}
    grantedRef.current = new Promise<void>((resolve) => {
      grant = resolve
    })
    const controller = new AbortController()

    const drive = async () => {
      if (stopped) return

      const started = (async () => {
        const contracts = await svcWallet.getContractManager()
        const manager = new RfqSwapManager({ indexer, contracts, repository: assetSwapRepository })
        const callbacks: AvailableRfqSwapManagerCallbacks = {
          claimLockup: claimLightningReceive(svcWallet, ark, assetSwapRepository),
          refundArkade: async () => {
            throw new Error('refundArkade is unreachable: this manager only monitors lightning_receive swaps')
          },
        }
        manager.setCallbacks(callbacks)
        await manager.restoreFromRepository()
        await manager.start()
        return manager
      })()

      managerRef.current = started
      grant()
      started
        .then(() => {
          if (!stopped) setReady(true)
        })
        .catch((err) => consoleError(err, 'failed to start lightning receive manager'))

      await held
      await started.then((manager) => manager.stop()).catch((err) => consoleError(err, 'failed to stop lightning receive manager'))
    }

    if (navigator.locks) {
      navigator.locks.request(MANAGER_LOCK, { signal: controller.signal }, drive).catch((err) => {
        if ((err as Error)?.name === 'AbortError') return
        consoleError(err, 'error acquiring the lightning receive lock')
      })
    } else {
      drive().catch((err) => consoleError(err, 'error driving lightning receives'))
    }

    return () => {
      stopped = true
      managerRef.current = undefined
      grantedRef.current = undefined
      setReady(false)
      controller.abort()
      release()
    }
  }, [svcWallet, aspInfo.url, aspInfo.network])

  const requestReceive = async (amountSats: number): Promise<LnReceiveInvoice> => {
    let pending = managerRef.current
    if (!pending && grantedRef.current) {
      await Promise.race([grantedRef.current, new Promise((resolve) => setTimeout(resolve, LOCK_GRACE_MS))])
      pending = managerRef.current
    }
    if (!svcWallet || !pending) {
      if (grantedRef.current) throw new LnReceiveHeldElsewhere()
      throw new Error('lightning receive service unavailable')
    }
    const manager = await pending
    const network = aspInfo.network as NetworkName
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
