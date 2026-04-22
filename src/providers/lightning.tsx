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
  migrateToSwapRepository,
  setLogger,
  isReverseFinalStatus,
  isSubmarineFinalStatus,
} from '@arkade-os/boltz-swap'
import { ConfigContext } from './config'
import { consoleError, consoleLog } from '../lib/logs'
import { sendOffChain } from '../lib/asp'
import { IndexedDBStorageAdapter } from '@arkade-os/sdk/adapters/indexedDB'
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
  const [swapManager, setSwapManager] = useState<SwapManagerClient | null>(null)
  const [fees, setFees] = useState<FeesResponse | null>(null)
  const [apiUrl, setApiUrl] = useState<string | null>(null)
  const feesFetchedForUrl = useRef<string | null>(null)

  const connected = config.apps.boltz.connected

  useEffect(() => {
    if (!aspInfo.network || !svcWallet) return

    const baseUrl = BASE_URLS[aspInfo.network as Network]
    if (!baseUrl) return

    setApiUrl(baseUrl)

    const network = aspInfo.network as Network
    const swapProvider = new BoltzSwapProvider({ apiUrl: baseUrl, network })
    const swapRepository = new IndexedDbSwapRepository('arkade-swaps')

    setLogger({
      log: (...args: unknown[]) => consoleLog(...args),
      error: (...args: unknown[]) => consoleError(args[0], args.slice(1).join(' ')),
      warn: (...args: unknown[]) => consoleLog(...args),
    })

    let cancelled = false
    let instance: ServiceWorkerArkadeSwaps | null = null

    const init = async () => {
      // One-time migration from legacy ContractRepository swap collections to
      // the new IndexedDbSwapRepository. No-op after first run.
      try {
        const legacyStorage = new IndexedDBStorageAdapter('arkade-service-worker')
        await migrateToSwapRepository(legacyStorage, swapRepository)
      } catch (err) {
        consoleError(err, 'Failed to migrate legacy swaps to swap repository')
      }

      instance = await ServiceWorkerArkadeSwaps.create({
        serviceWorker: svcWallet.serviceWorker,
        swapRepository,
        swapProvider,
        swapManager: config.apps.boltz.connected ? { autoStart: false } : false,
        network,
        arkServerUrl: aspInfo.url,
      })

      if (cancelled) {
        await instance.dispose().catch(consoleError)
        return
      }

      setArkadeLightning(instance)
      setSwapManager(instance.getSwapManager())

      if (config.apps.boltz.connected) {
        // Clean up stale non-final swaps before SwapManager starts polling them.
        // Boltz expires swaps after ~24-48h; anything older with a non-final status
        // would return 404 forever and cause non-stop polling.
        try {
          const STALE_SECONDS = 48 * 60 * 60
          const staleThreshold = Math.floor(Date.now() / 1000) - STALE_SECONDS
          const swaps = await instance.getSwapHistory()
          const staleSwaps = swaps.filter((s) => {
            if (s.type === 'reverse') return !isReverseFinalStatus(s.status) && s.createdAt < staleThreshold
            if (s.type === 'submarine') return !isSubmarineFinalStatus(s.status) && s.createdAt < staleThreshold
            return false
          })
          for (const swap of staleSwaps) {
            await swapRepository.saveSwap({ ...swap, status: 'swap.expired' })
          }
          if (staleSwaps.length > 0) {
            consoleLog(`Marked ${staleSwaps.length} stale swap(s) as expired before SwapManager start`)
          }
        } catch (err) {
          consoleError(err, 'Failed to clean up stale swaps')
        }

        if (!cancelled) await instance.startSwapManager()
      }
    }

    init().catch(consoleError)

    return () => {
      cancelled = true
      if (instance) instance.dispose().catch(consoleError)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspInfo.network, aspInfo.url, svcWallet, config.apps.boltz.connected])

  useEffect(() => {
    if (!arkadeLightning || !apiUrl) return
    if (feesFetchedForUrl.current === apiUrl) return
    feesFetchedForUrl.current = apiUrl
    arkadeLightning
      .getFees()
      .then(setFees)
      .catch((err) => {
        feesFetchedForUrl.current = null
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
