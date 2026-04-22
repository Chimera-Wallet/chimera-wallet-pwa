import { ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react'
import { clearStorage, readWalletFromStorage, saveWalletToStorage } from '../lib/storage'
import { NavigationContext, Pages } from './navigation'
import { getRestApiExplorerURL } from '../lib/explorers'
import { getBalance, getTxHistory, getVtxos, renewCoins, settleVtxos } from '../lib/asp'
import { AspContext } from './asp'
import { NotificationsContext } from './notifications'
import { FlowContext } from './flow'
import { arkNoteInUrl } from '../lib/arknote'
import { deepLinkInUrl, clearDeepLinkFromUrl } from '../lib/deepLink'
import { parseKycDeepLink } from '../lib/kyc'
import { consoleError } from '../lib/logs'
import { Tx, Vtxo, Wallet } from '../lib/types'
import { calcBatchLifetimeMs, calcNextRollover } from '../lib/wallet'
import {
  ArkNote,
  IndexedDBContractRepository,
  IndexedDBWalletRepository,
  NetworkName,
  ServiceWorkerWallet,
  SingleKey,
} from '@arkade-os/sdk'
import { IndexedDBStorageAdapter } from '@arkade-os/sdk/adapters/indexedDB'
import { IndexedDbSwapRepository, migrateToSwapRepository } from '@arkade-os/boltz-swap'
import { hex } from '@scure/base'
import * as secp from '@noble/secp256k1'
import { ConfigContext } from './config'
import { maxPercentage } from '../lib/constants'

// Thrown by initWallet when we refuse to boot the service worker because the
// Arkade server is unreachable. Unlock.tsx inspects this to show a useful
// error instead of a misleading "Invalid password". Not an SDK/crypto
// failure, so we keep a stable `code` for callers rather than relying on
// message-matching.
export class ArkadeUnreachableError extends Error {
  readonly code = 'ARKADE_UNREACHABLE'
  constructor(url: string) {
    super(`Arkade server unreachable at ${url || '(no url)'}`)
    this.name = 'ArkadeUnreachableError'
  }
}

const defaultWallet: Wallet = {
  network: '',
  nextRollover: 0,
}

interface WalletContextProps {
  initWallet: (seed: Uint8Array) => Promise<void>
  lockWallet: () => Promise<void>
  resetWallet: () => Promise<void>
  settlePreconfirmed: () => Promise<void>
  updateWallet: (w: Wallet | ((prev: Wallet) => Wallet)) => void
  isLocked: () => Promise<boolean>
  reloadWallet: (svcWallet?: ServiceWorkerWallet) => Promise<void>
  wallet: Wallet
  walletLoaded: boolean
  svcWallet: ServiceWorkerWallet | undefined
  txs: Tx[]
  vtxos: { spendable: Vtxo[]; spent: Vtxo[] }
  balance: number
  dataReady: boolean
  synced: boolean
  initialized?: boolean
}

export const WalletContext = createContext<WalletContextProps>({
  initWallet: () => Promise.resolve(),
  lockWallet: () => Promise.resolve(),
  resetWallet: () => Promise.resolve(),
  settlePreconfirmed: () => Promise.resolve(),
  updateWallet: () => {},
  reloadWallet: () => Promise.resolve(),
  wallet: defaultWallet,
  walletLoaded: false,
  svcWallet: undefined,
  isLocked: () => Promise.resolve(true),
  balance: 0,
  dataReady: false,
  synced: false,
  txs: [],
  vtxos: { spendable: [], spent: [] },
})

export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const { aspInfo } = useContext(AspContext)
  const { config, updateConfig } = useContext(ConfigContext)
  const { navigate } = useContext(NavigationContext)
  const { setNoteInfo, noteInfo, setDeepLinkInfo, deepLinkInfo, setKycAuthParams } = useContext(FlowContext)
  const { notifyTxSettled } = useContext(NotificationsContext)

  const [txs, setTxs] = useState<Tx[]>([])
  const [balance, setBalance] = useState(0)
  const [wallet, setWallet] = useState(defaultWallet)
  const [walletLoaded, setWalletLoaded] = useState(false)
  const [initialized, setInitialized] = useState<boolean>(false)
  const [svcWallet, setSvcWallet] = useState<ServiceWorkerWallet>()
  const [dataReady, setDataReady] = useState(false)
  const [synced, setSynced] = useState(false)
  const [vtxos, setVtxos] = useState<{ spendable: Vtxo[]; spent: Vtxo[] }>({ spendable: [], spent: [] })

  const hasLoadedOnce = useRef(false)
  const listeningForServiceWorker = useRef(false)
  const syncedRef = useRef(false)

  // read wallet from storage
  useEffect(() => {
    const walletFromStorage = readWalletFromStorage()
    if (walletFromStorage) setWallet(walletFromStorage)
    setWalletLoaded(true)
  }, [])

  // reload wallet as soon as we have a service worker wallet available
  useEffect(() => {
    if (svcWallet) reloadWallet().catch(consoleError)
  }, [svcWallet])

  // If the wallet loaded with no transactions and no balance, the service worker
  // won't fire VTXO_UPDATE (nothing to report). Mark as synced after a short delay
  // so we don't spin indefinitely on a genuinely empty wallet.
  useEffect(() => {
    if (!dataReady || synced || balance > 0 || txs.length > 0) return
    const timer = setTimeout(() => {
      if (!syncedRef.current) {
        syncedRef.current = true
        setSynced(true)
      }
    }, 5_000)
    return () => clearTimeout(timer)
  }, [dataReady, synced, balance, txs.length])

  // calculate thresholdMs and next rollover
  useEffect(() => {
    if (!initialized || !vtxos || !svcWallet) return
    const computeThresholds = async () => {
      try {
        const allVtxos = await svcWallet.getVtxos({ withRecoverable: true })
        const batchLifetimeMs = await calcBatchLifetimeMs(aspInfo, allVtxos)
        const thresholdMs = Math.floor((batchLifetimeMs * maxPercentage) / 100)
        const nextRollover = await calcNextRollover(vtxos.spendable, svcWallet, aspInfo)
        updateWallet((prev) => ({ ...prev, nextRollover, thresholdMs }))
      } catch (err) {
        consoleError(err, 'Error computing rollover thresholds')
      }
    }
    computeThresholds()
  }, [initialized, vtxos, svcWallet, aspInfo])

  // if ark note is present in the URL, decode it and set the note info
  useEffect(() => {
    const dlInfo = deepLinkInUrl()
    if (dlInfo) {
      setDeepLinkInfo(dlInfo)
    }
    const note = arkNoteInUrl()
    if (note) {
      try {
        const { value } = ArkNote.fromString(note)
        setNoteInfo({ note, satoshis: value })
      } catch (err) {
        consoleError(err, 'error decoding ark note ')
      }
    }
    // Clear deep link from URL after processing
    clearDeepLinkFromUrl()
  }, [])

  useEffect(() => {
    // Precedence is given to NoteInfo, but they are mutually exclusive because depend on window.location.hash
    if (!initialized || !dataReady) return
    if (noteInfo.satoshis) {
      // if voucher present, go to redeem page
      navigate(Pages.NotesRedeem)
      return
    }
    // if no deep link, don't navigate (let other effects handle default navigation)
    if (!deepLinkInfo?.appId) return
    
    // if app url is present, navigate to it
    switch (deepLinkInfo.appId) {
      case 'boltz':
        navigate(Pages.AppBoltz)
        break
      case 'lendasat':
        navigate(Pages.AppLendasat)
        break
      case 'lendaswap':
        navigate(Pages.AppLendaswap)
        break
      case 'kyc': {
        // Handle KYC deep link: pass auth params and navigate to Verification page
        const kycParams = deepLinkInfo.query ? parseKycDeepLink(deepLinkInfo.query) : null
        if (kycParams) {
          setKycAuthParams(kycParams)
        }
        navigate(Pages.SettingsKYC)
        break
      }
      default:
        navigate(Pages.Wallet)
    }
  }, [initialized, dataReady, noteInfo.satoshis, deepLinkInfo])

  const reloadWallet = async (swWallet = svcWallet) => {
    if (!swWallet) return
    try {
      const [vtxos, txs, balance] = await Promise.all([
        getVtxos(swWallet),
        getTxHistory(swWallet),
        getBalance(swWallet),
      ])
      setBalance(balance)
      setVtxos(vtxos)
      // Only replace existing transactions if we received data back.
      // During an ARK round the indexer can briefly return an empty list
      // while processing, causing transactions to flicker off then back on.
      setTxs((prev) => (txs.length > 0 ? txs : prev))
      if (!hasLoadedOnce.current) {
        hasLoadedOnce.current = true
        setDataReady(true)
      }
    } catch (err) {
      consoleError(err, 'Error reloading wallet')
      return
    }
  }

  const initSvcWorkerWallet = async ({
    arkServerUrl,
    esploraUrl,
    privateKey,
    retryCount = 0,
    maxRetries = 5,
  }: {
    arkServerUrl: string
    esploraUrl: string
    privateKey: string
    retryCount?: number
    maxRetries?: number
  }) => {
    try {
      // Main-thread repositories kept consistent with the ones the service
      // worker constructs (same IndexedDB). Passed in via `storage` so
      // svcWallet.walletRepository / contractRepository read the same data.
      const walletRepository = new IndexedDBWalletRepository()
      const contractRepository = new IndexedDBContractRepository()

      // create service worker wallet
      const svcWallet = await ServiceWorkerWallet.setup({
        serviceWorkerPath: '/wallet-service-worker.mjs',
        identity: SingleKey.fromHex(privateKey),
        arkServerUrl,
        esploraUrl,
        storage: { walletRepository, contractRepository },
        settlementConfig: {
          vtxoThreshold: wallet.thresholdMs ? Math.floor(wallet.thresholdMs / 1000) : 1,
        },
        messageTimeouts: { SETTLE: 60_000, SEND: 60_000 },
      })

      // Migrate legacy swap data (V1 ContractRepositoryImpl collections under
      // the 'arkade-service-worker' DB) into the new IndexedDbSwapRepository
      // before LightningProvider reads from it. Idempotent — writes a
      // done-flag on first successful run and no-ops thereafter. Catches the
      // "object stores was not found" case internally for fresh wallets.
      try {
        const oldStorage = new IndexedDBStorageAdapter('arkade-service-worker')
        await migrateToSwapRepository(oldStorage, new IndexedDbSwapRepository())
      } catch (err) {
        consoleError(err, 'Error migrating swap repository')
      }

      setSvcWallet(svcWallet)

      // handle messages from the service worker
      // we listen for UTXO/VTXO updates to refresh the tx history and balance
      const handleServiceWorkerMessages = (event: MessageEvent) => {
        if (event.data && ['VTXO_UPDATE', 'UTXO_UPDATE'].includes(event.data.type)) {
          reloadWallet(svcWallet)
          // reload again after a delay to give the indexer time to update its cache
          setTimeout(() => reloadWallet(svcWallet), 5000)
          // Mark synced on first service worker update — the service worker has
          // completed its initial sync with the indexer
          if (!syncedRef.current) {
            syncedRef.current = true
            setSynced(true)
          }
        }
      }

      // Fallback: if no VTXO_UPDATE arrives within 15s, mark as synced anyway
      setTimeout(() => {
        if (!syncedRef.current) {
          syncedRef.current = true
          setSynced(true)
        }
      }, 15_000)

      // listen for messages from the service worker
      if (listeningForServiceWorker.current) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessages)
        navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessages)
      } else {
        navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessages)
        listeningForServiceWorker.current = true
      }

      // check if the service worker wallet is initialized
      const { walletInitialized } = await svcWallet.getStatus()
      setInitialized(walletInitialized)

      // Ping the service worker wallet status. In v0.4 the worker lazily
      // initializes on the first message (getStatus included) and re-runs the
      // full init — including a CORS-sensitive GET /v1/info — every time init
      // previously failed. A tight 1s loop would hammer that until rate-limited.
      // Stop pinging after a handful of consecutive failures so a bad ASP URL
      // or CORS block doesn't produce a forever-retry storm, and slow the
      // cadence to 5s once we have at least one successful reading.
      let consecutiveFailures = 0
      const MAX_FAILURES = 5
      const pingIntervalMs = walletInitialized ? 5_000 : 1_000
      const pingHandle = setInterval(async () => {
        try {
          const { walletInitialized } = await svcWallet.getStatus()
          setInitialized(walletInitialized)
          consecutiveFailures = 0
        } catch (err) {
          consoleError(err, 'Error pinging wallet status')
          consecutiveFailures += 1
          if (consecutiveFailures >= MAX_FAILURES) {
            clearInterval(pingHandle)
            consoleError(
              new Error('Wallet status ping halted after repeated failures'),
              'Likely causes: ASP unreachable, CORS, or network offline',
            )
          }
        }
      }, pingIntervalMs)

      // renew expiring coins on startup
      renewCoins(svcWallet, aspInfo.dust, wallet.thresholdMs).catch(() => {})
    } catch (err) {
      if (err instanceof Error && err.message.includes('Service worker activation timed out')) {
        if (retryCount < maxRetries) {
          // exponential backoff: wait 1s, 2s, 4s for each retry
          const delay = Math.pow(2, retryCount) * 1000
          consoleError(
            new Error(
              `Service worker activation timed out, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`,
            ),
            'Service worker activation retry',
          )
          await new Promise((resolve) => setTimeout(resolve, delay))
          return initSvcWorkerWallet({
            arkServerUrl,
            esploraUrl,
            privateKey,
            retryCount: retryCount + 1,
            maxRetries,
          })
        } else {
          consoleError(
            new Error('Service worker activation timed out after maximum retries'),
            'Service worker activation failed',
          )
          return
        }
      }
      // re-throw other errors
      throw err
    }
  }

  const initWallet = async (privateKey: Uint8Array) => {
    // Don't kick off the service worker when the Arkade server is
    // unreachable: the worker's v0.4 bootstrap does an eager GET /v1/info
    // inside buildServices and will retry that call on every subsequent
    // message if it fails, producing a CORS/fetch loop driven by our
    // status-ping interval.
    //
    // Throw (rather than silently return) so Unlock.tsx's .catch fires and
    // the caller doesn't proceed into a half-initialized state where
    // svcWallet is undefined but `unlocked` was set to true — that cascaded
    // into `Cannot read properties of undefined (reading 'getAddress')`
    // in the v0.4 SDK message handler when downstream screens called into
    // the worker expecting a ready wallet.
    if (aspInfo.unreachable || !aspInfo.url || !aspInfo.network) {
      throw new ArkadeUnreachableError(aspInfo.url ?? '')
    }
    const arkServerUrl = aspInfo.url
    const network = aspInfo.network as NetworkName
    const esploraUrl = getRestApiExplorerURL(network) ?? ''
    const pubkey = hex.encode(secp.getPublicKey(privateKey))
    updateConfig({ ...config, pubkey })
    await initSvcWorkerWallet({
      privateKey: hex.encode(privateKey),
      arkServerUrl,
      esploraUrl,
    })
    updateWallet({ ...wallet, network, pubkey })
    setInitialized(true)
  }

  const lockWallet = async () => {
    if (!svcWallet) throw new Error('Service worker not initialized')
    await svcWallet.clear()
    setSvcWallet(undefined)
    setInitialized(false)
    setDataReady(false)
    setSynced(false)
    syncedRef.current = false
    hasLoadedOnce.current = false
  }

  const resetWallet = async () => {
    if (!svcWallet) throw new Error('Service worker not initialized')
    await clearStorage()
    await svcWallet.clear()
    await svcWallet.walletRepository.clear()
    await svcWallet.contractRepository.clear()
    setDataReady(false)
    setSynced(false)
    syncedRef.current = false
    hasLoadedOnce.current = false
  }

  const settlePreconfirmed = async () => {
    if (!svcWallet) throw new Error('Service worker not initialized')
    await settleVtxos(svcWallet, aspInfo.dust, wallet.thresholdMs)
    notifyTxSettled()
  }

  const updateWallet = (data: Wallet | ((prev: Wallet) => Wallet)) => {
    setWallet((prev) => {
      const next = typeof data === 'function' ? (data as (prev: Wallet) => Wallet)(prev) : data
      saveWalletToStorage(next)
      return { ...next }
    })
  }

  const isLocked = async () => {
    if (!svcWallet) return true
    try {
      const { walletInitialized } = await svcWallet.getStatus()
      return !walletInitialized
    } catch {
      return true
    }
  }

  return (
    <WalletContext.Provider
      value={{
        initWallet,
        isLocked,
        initialized,
        resetWallet,
        settlePreconfirmed,
        updateWallet,
        wallet,
        walletLoaded,
        svcWallet,
        lockWallet,
        txs,
        balance,
        dataReady,
        synced,
        reloadWallet,
        vtxos: vtxos ?? { spendable: [], spent: [] },
      }}
    >
      {children}
    </WalletContext.Provider>
  )
}
