import {
  MessageBus,
  WalletMessageHandler,
  IndexedDBWalletRepository,
  IndexedDBContractRepository,
} from '@arkade-os/sdk'
import {
  ArkadeSwapsMessageHandler,
  IndexedDbSwapRepository,
} from '@arkade-os/boltz-swap'

const walletRepository = new IndexedDBWalletRepository('arkade-service-worker')
const contractRepository = new IndexedDBContractRepository('arkade-service-worker')
const swapRepository = new IndexedDbSwapRepository('arkade-swaps')

const bus = new MessageBus(walletRepository, contractRepository, {
  messageHandlers: [
    new WalletMessageHandler(),
    new ArkadeSwapsMessageHandler(swapRepository),
  ],
})
bus.start().catch(console.error)

// Use build timestamp to ensure cache invalidation on each deployment
const CACHE_VERSION = '__BUILD_TIME__' // Will be replaced during build
const CACHE_NAME = `chimera-wallet-cache-${CACHE_VERSION}`
declare const self: ServiceWorkerGlobalScope

// install event: activate service worker immediately
self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(caches.open(CACHE_NAME))
  self.skipWaiting()
})

// activate event: clean up old caches
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName === CACHE_NAME) return
          console.log('Deleting old cache:', cacheName)
          return caches.delete(cacheName)
        }),
      )
    }).then(() => {
      return self.clients.matchAll({
        includeUncontrolled: true,
        type: 'window',
      })
    }).then((clients) => {
      clients.forEach((client) => {
        console.log('Sending reload message to client')
        client.postMessage({ type: 'RELOAD_PAGE' })
      })
    }),
  )
  self.clients.claim()
})

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
