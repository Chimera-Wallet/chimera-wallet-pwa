import { useContext, useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RfqSwapManagerCallbacks, RfqSwapManagerDeps } from '@arkade-os/swap'
import { AspContext } from '../../providers/asp'
import { WalletContext } from '../../providers/wallet'
import { LnReceiveContext, LnReceiveProvider } from '../../providers/lnReceive'
import { mockAspContextValue, mockWalletContextValue } from '../screens/mocks'
import { discoverMarkets } from '../../lib/swapMarkets'
import { lnReceiveRendezvous } from '../../lib/lnSwap'
import { withRfqTransport } from '../../lib/nostrRfq'
import { requestLnReceive } from '../../lib/lnReceive'

/**
 * What is under test here is the Web Lock that keeps a second tab from
 * driving its own `RfqSwapManager` over the same shared repository — the
 * manager itself is the package's, and the negotiation (`requestLnReceive`)
 * is exercised elsewhere. Every dependency `requestReceive` touches besides
 * the lock is stubbed to resolve trivially so these tests only ever wait on
 * lock timing.
 */
const addSwap = vi.hoisted(() => vi.fn())
const start = vi.hoisted(() => vi.fn())
const stop = vi.hoisted(() => vi.fn())
const restoreFromRepository = vi.hoisted(() => vi.fn())
const setCallbacks = vi.hoisted(() => vi.fn())
const captured = vi.hoisted(() => ({ deps: undefined as RfqSwapManagerDeps | undefined }))

vi.mock('@arkade-os/swap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@arkade-os/swap')>()),
  RfqSwapManager: class {
    constructor(deps: RfqSwapManagerDeps) {
      captured.deps = deps
    }
    setCallbacks = (callbacks: RfqSwapManagerCallbacks) => setCallbacks(callbacks)
    start = start
    stop = stop
    addSwap = addSwap
    restoreFromRepository = restoreFromRepository
    poll = vi.fn()
  },
}))

// Real construction opens an IndexedDB connection jsdom does not provide;
// nothing under test reads from it, so a stand-in with the right shape is
// enough.
vi.mock('../../lib/indexer', () => ({
  Indexer: class {
    provider = {}
  },
}))

// Implementations are (re-)established in `beforeEach` rather than baked in
// here: `src/test/setup.ts` runs a global `vi.restoreAllMocks()` after every
// test, which resets a `vi.fn()`'s implementation to a no-op — set only once
// at module load, these would work for the first test in the file and return
// `undefined` for every one after it.
vi.mock('../../lib/swapMarkets', () => ({
  discoverMarkets: vi.fn(),
}))

vi.mock('../../lib/lnSwap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/lnSwap')>()),
  lnReceiveRendezvous: vi.fn(),
}))

vi.mock('../../lib/nostrRfq', () => ({
  withRfqTransport: vi.fn(),
}))

const negotiated = (rfqId = 'rfq-1') => ({
  rfqId,
  invoice: 'lnbc105u1p...',
  payAmount: 10_500,
  expectedAmount: 10_000,
  invoiceExpiresAt: 1_800_000_600,
  address: 'tark1qlockup',
  swapPkScript: new Uint8Array([0x51, 0x20, 0xab]),
  script: {},
  payoutAddress: 'tark1qpayout',
  secrets: {
    descriptor: 'tr(aa)',
    pubkey: new Uint8Array(32).fill(2),
    preimage: new Uint8Array(32).fill(3),
    paymentHash: new Uint8Array(32).fill(4),
    mustPersistPreimage: true,
  },
  refundLocktime: 1_800_003_600,
})

vi.mock('../../lib/lnReceive', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/lnReceive')>()),
  requestLnReceive: vi.fn(),
}))

function Harness({ tab = 'a' }: { tab?: string }) {
  const { ready, requestReceive } = useContext(LnReceiveContext)
  const [rejected, setRejected] = useState('')
  return (
    <div data-testid={`tab-${tab}`}>
      <span data-testid={`ready-${tab}`}>{ready ? 'ready' : 'not-ready'}</span>
      <button
        onClick={() =>
          requestReceive(10_000).catch((err: Error) => {
            setRejected(`${err?.name}: ${err?.message}`)
          })
        }
      >{`Request ${tab}`}</button>
      <span data-testid='rejected'>{rejected || 'none'}</span>
    </div>
  )
}

const wrap = (children: React.ReactNode) => (
  <AspContext.Provider value={{ ...mockAspContextValue } as never}>
    <WalletContext.Provider
      value={{ ...mockWalletContextValue, svcWallet: { getContractManager: async () => ({}) } } as never}
    >
      {children}
    </WalletContext.Provider>
  </AspContext.Provider>
)

const renderProvider = () =>
  render(
    wrap(
      <LnReceiveProvider>
        <Harness />
      </LnReceiveProvider>,
    ),
  )

/**
 * A `navigator.locks` stand-in: the real API cannot be exercised in jsdom, and
 * the property under test is ordering, which a queue reproduces exactly. One
 * FIFO queue per name, the holder releasing by RETURNING — which is the whole
 * point, since an abort cannot release a lock already granted.
 */
const fakeLocks = () => {
  const tails = new Map<string, Promise<void>>()
  return {
    request: (name: string, options: { signal?: AbortSignal }, callback: () => Promise<void>) => {
      const tail = tails.get(name) ?? Promise.resolve()
      let settle = () => {}
      const held = new Promise<void>((resolve) => {
        settle = resolve
      })
      tails.set(
        name,
        tail.then(() => held),
      )
      return tail.then(async () => {
        if (options.signal?.aborted) {
          settle()
          const aborted = new Error('lock request aborted')
          aborted.name = 'AbortError'
          throw aborted
        }
        try {
          await callback()
        } finally {
          settle()
        }
      })
    },
  }
}

/**
 * `fakeLocks` with the grant held open: the request is queued, nothing has
 * run it yet. It stands in for the gap between asking for the lock and being
 * given it — the remount case, where this tab's own request waits on its
 * previous drive to stop its manager — which is NOT another tab holding it.
 */
const gatedLocks = () => {
  const locks = fakeLocks()
  let open = () => {}
  const gate = new Promise<void>((resolve) => {
    open = resolve
  })
  return {
    open: () => open(),
    request: (name: string, options: { signal?: AbortSignal }, callback: () => Promise<void>) =>
      locks.request(name, options, async () => {
        await gate
        return callback()
      }),
  }
}

const withLocks = (locks: unknown) =>
  Object.defineProperty(navigator, 'locks', { value: locks, configurable: true, writable: true })

beforeEach(() => {
  captured.deps = undefined
  addSwap.mockReset().mockResolvedValue(undefined)
  start.mockReset().mockResolvedValue(undefined)
  stop.mockReset().mockResolvedValue(undefined)
  restoreFromRepository.mockReset().mockResolvedValue(undefined)
  setCallbacks.mockReset()
  vi.mocked(discoverMarkets).mockReset().mockResolvedValue([])
  vi.mocked(lnReceiveRendezvous)
    .mockReset()
    .mockReturnValue({
      solverPubkey: 'solver',
      transports: { nostr: { relays: ['wss://relay.test'] } },
      emulatorPubkey: '00'.repeat(32),
      minSats: 1_000,
      maxSats: 100_000,
    })
  vi.mocked(withRfqTransport)
    .mockReset()
    .mockImplementation((_rendezvous, fn) => fn({} as never))
  vi.mocked(requestLnReceive)
    .mockReset()
    .mockImplementation(async () => negotiated() as never)
  withLocks(fakeLocks())
})

afterEach(() => vi.clearAllMocks())

describe('LnReceiveProvider', () => {
  it('becomes ready once the manager has started', async () => {
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('ready-a')).toHaveTextContent('ready'))
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('lets only one tab drive, and tells the other one why', async () => {
    render(
      wrap(
        <>
          <LnReceiveProvider>
            <Harness tab='a' />
          </LnReceiveProvider>
          <LnReceiveProvider>
            <Harness tab='b' />
          </LnReceiveProvider>
        </>,
      ),
    )
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1))

    // Two managers over one repository would mean two `pushClaim`s over the
    // same VTXOs: one lands, the other fails as a double-spend, and both
    // write records that disagree about the claim.
    const b = within(screen.getByTestId('tab-b'))
    await userEvent.click(b.getByText('Request b'))
    // Named, not generic: nothing is unavailable, and "manager is not
    // running" would be false — the other tab is driving these swaps
    // perfectly well.
    await waitFor(() => expect(b.getByTestId('rejected')).toHaveTextContent('LnReceiveHeldElsewhere'), {
      timeout: 3000,
    })
    expect(start).toHaveBeenCalledTimes(1)
    expect(addSwap).not.toHaveBeenCalled()
  })

  it('waits out its own pending request rather than blaming a tab that is not there', async () => {
    const locks = gatedLocks()
    withLocks(locks)
    renderProvider()
    await userEvent.click(screen.getByText('Request a'))

    // Pending says nothing about WHO holds it — this tab's own request is
    // pending too, right up until it is granted. Answering "another tab is
    // handling Lightning receives" here tells the only open tab to close a
    // tab that does not exist.
    expect(screen.getByTestId('rejected')).toHaveTextContent('none')
    expect(addSwap).not.toHaveBeenCalled()

    locks.open()
    await waitFor(() => expect(addSwap).toHaveBeenCalled())
    expect(screen.getByTestId('rejected')).toHaveTextContent('none')
  })

  it('releases the lock on effect teardown, so the next mount can drive', async () => {
    const first = renderProvider()
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1))

    // The case that actually bites: `svcWallet` changing identity re-runs
    // this effect in-page, and StrictMode would double-mount it. An
    // abort-only cleanup leaves the callback never returning, so the next
    // request queues behind a lock nobody will ever release and receives are
    // dead until a full reload.
    first.unmount()
    renderProvider()
    await waitFor(() => expect(start).toHaveBeenCalledTimes(2), { timeout: 2000 })
  })

  it('drives without Web Locks rather than refusing to run', async () => {
    // An insecure context, or a browser without the API. Single-tab is the
    // common case, and refusing would lose every receive to protect against a
    // race that may never happen.
    withLocks(undefined)
    renderProvider()
    await waitFor(() => expect(start).toHaveBeenCalled())

    await userEvent.click(screen.getByText('Request a'))
    await waitFor(() => expect(addSwap).toHaveBeenCalled())
  })
})
