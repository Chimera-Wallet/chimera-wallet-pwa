import { ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react'
import { AspContext } from './asp'
import { WalletContext } from './wallet'
import {
  BoltzReverseSwap,
  BoltzSubmarineSwap,
  BoltzSwapProvider,
  FeesResponse,
  IndexedDbSwapRepository,
  Network,
  ServiceWorkerArkadeSwaps,
  SwapManagerClient,
  setLogger,
} from '@arkade-os/boltz-swap'
import { ConfigContext } from './config'
import { consoleError, consoleLog } from '../lib/logs'
import { sendOffChain } from '../lib/asp'
import { PendingSwap } from '../lib/types'

const BASE_URLS: Record<Network, string | null> = {
  bitcoin: import.meta.env.VITE_BOLTZ_URL ?? 'https://api.ark.boltz.exchange',
  mutinynet: 'https://api.boltz.mutinynet.arkade.sh',
  signet: 'https://boltz.signet.arkade.sh',
  regtest: 'http://localhost:9069',
  testnet: null,
}

interface LightningContextProps {
  connected: boolean
  calcSubmarineSwapFee: (satoshis: number) => number
  calcReverseSwapFee: (satoshis: number) => number
  arkadeLightning: ServiceWorkerArkadeSwaps | null
  swapManager: SwapManagerClient | null
  toggleConnection: () => void
  createSubmarineSwap: (invoice: string) => Promise<BoltzSubmarineSwap | null>
  createReverseSwap: (sats: number) => Promise<BoltzReverseSwap | null>
  claimVHTLC: (swap: BoltzReverseSwap) => Promise<void>
  refundVHTLC: (swap: BoltzSubmarineSwap) => Promise<void>
  payInvoice: (swap: BoltzSubmarineSwap) => Promise<{ txid: string; preimage: string }>
  getSwapHistory: () => Promise<PendingSwap[]>
  getFees: () => Promise<FeesResponse | null>
  getApiUrl: () => string | null
  restoreSwaps: () => Promise<number>
}

export const LightningContext = createContext<LightningContextProps>({
  connected: false,
  arkadeLightning: null,
  swapManager: null,
  toggleConnection: () => {},
  calcReverseSwapFee: () => 0,
  calcSubmarineSwapFee: () => 0,
  createSubmarineSwap: async () => null,
  createReverseSwap: async () => null,
  claimVHTLC: async () => {},
  refundVHTLC: async () => {},
  payInvoice: async () => {
    throw new Error('Lightning not initialized')
  },
  getSwapHistory: async () => [],
  getFees: async () => null,
  getApiUrl: () => null,
  restoreSwaps: async () => 0,
})

export const LightningProvider = ({ children }: { children: ReactNode }) => {
  const { aspInfo } = useContext(AspContext)
  const { svcWallet } = useContext(WalletContext)
  const { config, updateConfig, backupConfig } = useContext(ConfigContext)

  const [arkadeLightning, setArkadeLightning] = useState<ServiceWorkerArkadeSwaps | null>(null)
  const [fees, setFees] = useState<FeesResponse | null>(null)
  const [apiUrl, setApiUrl] = useState<string | null>(null)
  // Track which URL fees have already been fetched for to avoid redundant network calls
  // when arkadeLightning is recreated with the same server URL.
  const feesFetchedForUrl = useRef<string | null>(null)

  const connected = config.apps.boltz.connected

  // Create ServiceWorkerArkadeSwaps when svcWallet and network are ready.
  // Swap processing, polling, claim/refund all live inside the service worker.
  useEffect(() => {
    if (!aspInfo.network || !svcWallet) return

    const baseUrl = BASE_URLS[aspInfo.network as Network]
    if (!baseUrl) return // No boltz server for this network

    setApiUrl(baseUrl)

    const network = aspInfo.network as Network
    const swapProvider = new BoltzSwapProvider({ apiUrl: baseUrl, network })

    setLogger({
      log: (...args: unknown[]) => consoleLog(...args),
      error: (...args: unknown[]) => consoleError(args[0], args.slice(1).join(' ')),
      warn: (...args: unknown[]) => consoleLog(...args),
    })

    let disposeArkadeSwaps: (() => Promise<void>) | null = null
    let cancelled = false

    ServiceWorkerArkadeSwaps.create({
      serviceWorker: svcWallet.serviceWorker,
      swapRepository: new IndexedDbSwapRepository(),
      swapProvider,
      network,
      arkServerUrl: aspInfo.url,
      swapManager: config.apps.boltz.connected,
    })
      .then((instance) => {
        if (cancelled) {
          instance.dispose().catch(consoleError)
          return
        }
        disposeArkadeSwaps = () => instance.dispose().catch(consoleError)
        setArkadeLightning(instance)
      })
      .catch((err) => {
        consoleError(err, 'Failed to initialize arkade swaps')
      })

    return () => {
      cancelled = true
      if (disposeArkadeSwaps) disposeArkadeSwaps().catch(consoleError)
    }
    // Only depend on primitive values from aspInfo, not the object reference itself.
    // aspInfo is recreated as a new object on every setAspInfo call (even with identical data),
    // which would otherwise recreate ServiceWorkerArkadeSwaps and re-fetch fees unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspInfo.network, aspInfo.url, svcWallet, config.apps.boltz.connected])

  // fetch fees when arkadeLightning is ready, but only if we haven't already
  // fetched for this server URL. Prevents redundant /submarine + /reverse calls
  // if arkadeLightning is recreated (e.g. service worker retry) with the same URL.
  useEffect(() => {
    if (!arkadeLightning || !apiUrl) return
    if (feesFetchedForUrl.current === apiUrl) return
    feesFetchedForUrl.current = apiUrl
    arkadeLightning
      .getFees()
      .then(setFees)
      .catch((err) => {
        feesFetchedForUrl.current = null // allow retry on next render
        consoleError(err, 'Failed to fetch fees')
      })
  }, [arkadeLightning, apiUrl])

  const setConnected = (value: boolean, backup: boolean) => {
    const newConfig = { ...config }
    newConfig.apps.boltz.connected = value
    updateConfig(newConfig)
    if (backup) backupConfig(newConfig)
  }

  const calcSubmarineSwapFee = (satoshis: number): number => {
    if (!satoshis || !fees) return 0
    const { percentage, minerFees } = fees.submarine
    return Math.ceil((satoshis * percentage) / 100 + minerFees)
  }

  const calcReverseSwapFee = (satoshis: number): number => {
    if (!satoshis || !fees) return 0
    const { percentage, minerFees } = fees.reverse
    return Math.ceil((satoshis * percentage) / 100 + minerFees.claim + minerFees.lockup)
  }

  const toggleConnection = () => setConnected(!connected, true)

  // Helper methods that delegate to arkadeLightning
  const createSubmarineSwap = async (invoice: string): Promise<BoltzSubmarineSwap | null> => {
    if (!arkadeLightning) return null
    return arkadeLightning.createSubmarineSwap({ invoice })
  }

  const createReverseSwap = async (sats: number): Promise<BoltzReverseSwap | null> => {
    if (!arkadeLightning) return null
    return arkadeLightning.createReverseSwap({ amount: sats, description: 'Lightning Invoice' })
  }

  const claimVHTLC = async (swap: BoltzReverseSwap): Promise<void> => {
    if (!arkadeLightning) return
    await arkadeLightning.claimVHTLC(swap)
  }

  const refundVHTLC = async (swap: BoltzSubmarineSwap): Promise<void> => {
    if (!arkadeLightning) return
    await arkadeLightning.refundVHTLC(swap)
  }

  const payInvoice = async (pendingSwap: BoltzSubmarineSwap): Promise<{ txid: string; preimage: string }> => {
    if (!arkadeLightning || !svcWallet) throw new Error('Lightning not initialized')
    if (!pendingSwap) throw new Error('No pending swap found')
    if (!pendingSwap.response.address) throw new Error('No swap address found')
    if (!pendingSwap.response.expectedAmount) throw new Error('No swap amount found')

    const satoshis = pendingSwap.response.expectedAmount
    const swapAddress = pendingSwap.response.address

    const txid = await sendOffChain(svcWallet, satoshis, swapAddress)
    if (!txid) throw new Error('Failed to send offchain payment')

    try {
      const { preimage } = await arkadeLightning.waitForSwapSettlement(pendingSwap)
      return { txid, preimage }
    } catch (e: unknown) {
      consoleError(e, 'Swap failed')
      throw new Error('Swap failed')
    }
  }

  // Chimera has no chain-swap UI; filter chain swaps out so the history list
  // (and anything that narrows to reverse|submarine) doesn't trip over them.
  const getSwapHistory = async (): Promise<PendingSwap[]> => {
    if (!arkadeLightning) return []
    const history = await arkadeLightning.getSwapHistory()
    return history.filter((s): s is BoltzReverseSwap | BoltzSubmarineSwap => s.type !== 'chain')
  }

  const getFees = async (): Promise<FeesResponse | null> => {
    if (!arkadeLightning) return null
    return arkadeLightning.getFees()
  }

  const getApiUrl = (): string | null => apiUrl

  const restoreSwaps = async (): Promise<number> => {
    if (!arkadeLightning) return 0

    let counter = 0

    let reverseSwaps: BoltzReverseSwap[] = []
    let submarineSwaps: BoltzSubmarineSwap[] = []
    try {
      const result = await arkadeLightning.restoreSwaps()
      reverseSwaps = result.reverseSwaps
      submarineSwaps = result.submarineSwaps
    } catch (err) {
      consoleError(err, 'Error restoring swaps from Boltz:')
      return 0
    }
    if (reverseSwaps.length === 0 && submarineSwaps.length === 0) return 0

    // Dedup against persisted history using top-level swap.id (the new repo's key).
    const history = await arkadeLightning.getSwapHistory()
    const historyIds = new Set(history.map((s) => s.id))

    for (const swap of [...reverseSwaps, ...submarineSwaps]) {
      if (historyIds.has(swap.id)) continue
      try {
        await arkadeLightning.swapRepository.saveSwap(swap)
        counter++
      } catch (err) {
        consoleError(err, `Failed to save restored swap ${swap.id}`)
      }
    }

    return counter
  }

  const swapManager = arkadeLightning?.getSwapManager() ?? null

  return (
    <LightningContext.Provider
      value={{
        connected,
        arkadeLightning,
        swapManager,
        toggleConnection,
        calcReverseSwapFee,
        calcSubmarineSwapFee,
        createSubmarineSwap,
        createReverseSwap,
        claimVHTLC,
        refundVHTLC,
        payInvoice,
        getSwapHistory,
        getFees,
        getApiUrl,
        restoreSwaps,
      }}
    >
      {children}
    </LightningContext.Provider>
  )
}
