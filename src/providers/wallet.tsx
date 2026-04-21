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
import { ArkNote, ServiceWorkerWallet, NetworkName, SingleKey } from '@arkade-os/sdk'
import { hex } from '@scure/base'
import * as secp from '@noble/secp256k1'
import { ConfigContext } from './config'
import { maxPercentage } from '../lib/constants'

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
      // create service worker wallet
      const svcWallet = await ServiceWorkerWallet.setup({
        serviceWorkerPath: '/wallet-service-worker.mjs',
        identity: SingleKey.fromHex(privateKey),
        arkServerUrl,
        esploraUrl,
      })
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

      // ping the service worker wallet status every 1 second
      setInterval(async () => {
        try {
          const { walletInitialized } = await svcWallet.getStatus()
          setInitialized(walletInitialized)
        } catch (err) {
          consoleError(err, 'Error pinging wallet status')
        }
      }, 1_000)

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
