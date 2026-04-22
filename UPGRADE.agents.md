# Upgrade plan: `@arkade-os/sdk` 0.3.12 → 0.4.17 and `@arkade-os/boltz-swap` 0.2.19 → 0.3.18

Reference wallet: `../wallet` (already on the target versions, uses the service-worker-hosted swap architecture). Goal is to upgrade chimera-wallet-pwa without breaking UX/UI, and to converge on the same service-worker architecture — **no main-thread workarounds for swap handling**.

## 1. Scope

| Package | Chimera (current) | Target | Jump |
|---|---|---|---|
| `@arkade-os/sdk` | 0.3.12 | 0.4.17 | 229 commits; major-like |
| `@arkade-os/boltz-swap` | 0.2.19 | 0.3.18 | 294 commits; major-like |

**Hard coupling:** boltz-swap 0.3.x requires sdk ≥ 0.4.16. Bump together.

**Architectural constraint added:** follow `../wallet`'s pattern where all swap processing lives inside the service worker (`ArkadeSwapsMessageHandler` + `ServiceWorkerArkadeSwaps`) and main-thread code talks to it via the message bus. This eliminates the current main-thread `new ArkadeLightning({...})` + raw `ContractRepositoryImpl` cleanup loop in `providers/lightning.tsx`.

**Prior art:** GitHub PR [Chimera-Wallet/chimera-wallet-pwa#4](https://github.com/Chimera-Wallet/chimera-wallet-pwa/pull/4) ("upgrade-sdk-v0.4" by tiero) attempted the same upgrade over 3 iterative commits ("upgrade-sdk-v0.4", "debounce", "fix loop in restart"). **It is reported broken** — unknown remaining failure modes — but its diff surfaces several real bugs the upgrade introduces that would otherwise have to be discovered the hard way. Findings from that PR are folded into the phases below (retry-storm fix, IndexedDB schema collision in `lib/indexer.ts`, broadcast payload shape change, new `BoltzSwapStatus` values, subscription APIs going async, response-field nullability). Do **not** copy PR #4 wholesale — start from our clean base, use `../wallet/src/providers/swaps.tsx` as the canonical reference, and fold in PR #4's specific fixes as deltas. After Phase 3 lands, consider checking out the PR branch to reproduce its failure mode so we don't recreate it.

## 2. Architecture — before and after

### Current (chimera, 0.2/0.3)

```
Main thread                           SW (wallet-service-worker.ts)
├── providers/wallet.tsx              ├── new Worker()
│   └── ServiceWorkerWallet.setup     └── worker.start()
├── providers/lightning.tsx
│   ├── new ArkadeLightning({...})   ◄── swap processing lives HERE
│   ├── startWithCleanup()           (reads/writes IndexedDB directly
│   │   └── ContractRepositoryImpl    from the main thread)
│   │       .saveToContractCollection()
│   └── SwapManager (polls Boltz from the page)
├── lib/backup.ts
│   └── ContractRepositoryImpl for swap read/write
└── lib/indexer.ts
    └── ContractRepositoryImpl for commitment-tx cache
```

Issues: SwapManager stops polling when the tab sleeps; no path to shared SW lifecycle; custom IndexedDB writes bypass the new repository layout.

### Target (wallet, 0.4/0.3.18)

```
Main thread                           SW (wallet-service-worker.ts)
├── providers/wallet.tsx              ├── new IndexedDBWalletRepository()
│   ├── new IndexedDBWalletRepository()├── new IndexedDBContractRepository()
│   ├── new IndexedDBContractRepository()├── new IndexedDbSwapRepository()
│   ├── ServiceWorkerWallet.setup({   └── new MessageBus(walletRepo, contractRepo, {
│   │     storage: {walletRepo, contractRepo},  messageHandlers: [
│   │     settlementConfig: {...},                new WalletMessageHandler(),
│   │   })                                        new ArkadeSwapsMessageHandler(swapRepo),
│   └── migrateToSwapRepository(old, new)      ]
│       (for users upgrading in-place)        })
├── providers/lightning.tsx (rewrite as SwapsProvider)
│   └── ServiceWorkerArkadeSwaps.create({
│         serviceWorker: svcWallet.serviceWorker,  ◄── delegates to the SW
│         swapRepository: new IndexedDbSwapRepository(),
│         swapProvider: new BoltzSwapProvider(...),
│         network, arkServerUrl,
│         swapManager: connected,
│       })
├── lib/backup.ts                     (swap polling, claim/refund, settlement
│   └── IndexedDbSwapRepository         all runs inside the SW — survives tab sleep)
└── lib/indexer.ts
    └── IndexedDBStorageAdapter('arkade-indexer-cache')  (separate DB — the v0.4
        repos own 'arkade-service-worker' now, schemas collide otherwise)
```

Benefits: SW-resident swap polling survives tab sleep; unified repository layout; shared SW instance between wallet and swaps (one registration, one message channel).

## 3. What chimera actually uses (SDK surface map)

25 files import the two packages. Key sites:

- **Core wallet plumbing:** `src/wallet-service-worker.ts`, `src/providers/wallet.tsx`, `src/providers/lightning.tsx`, `src/providers/asp.tsx`, `src/lib/asp.ts`, `src/lib/indexer.ts`, `src/lib/backup.ts`, `src/lib/wallet.ts`, `src/lib/address.ts`, `src/lib/utxo.ts`, `src/lib/vtxo.ts`, `src/lib/explorers.ts`, `src/lib/types.ts`
- **Screens/components:** `src/screens/Wallet/Send/Form.tsx`, `src/screens/Wallet/Receive/QrCode.tsx`, `src/screens/Wallet/Notes/Form.tsx`, `src/screens/Settings/Support.tsx`, `src/screens/Settings/Vtxos.tsx`, `src/screens/Apps/Boltz/Swap.tsx`, `src/screens/Apps/Lendasat/Index.tsx`, `src/components/SwapsList.tsx`
- **Tests:** `src/test/lib/utxo.test.ts`, `src/test/screens/mocks.ts`

Not used by chimera (skip in upgrade): Contracts/DelegateVtxo, BIP-322, Asset extension, Expo adapters, `BatchSignableIdentity`, chain-swap UI.

## 4. Breaking changes that affect chimera

Verified against `git diff v0.3.12..v0.4.17` (ts-sdk) and `git diff v0.2.19..v0.3.18` (boltz-swap).

### 4a. Hard breaks

| # | Where | Old | New | Effort |
|---|---|---|---|---|
| 1 | `src/wallet-service-worker.ts` | `import { Worker } from '@arkade-os/sdk'; new Worker(); worker.start()/reload()` | `new MessageBus(walletRepo, contractRepo, { messageHandlers: [new WalletMessageHandler(), new ArkadeSwapsMessageHandler(swapRepo)], tickIntervalMs, messageTimeoutMs })` | **High** — full rewrite; use `../wallet/src/wallet-service-worker.ts` as the blueprint. |
| 2 | `src/providers/lightning.tsx` | Main-thread `new ArkadeLightning({...})` + manual 48h stale-swap cleanup + direct `IndexedDBStorageAdapter`/`ContractRepositoryImpl` usage for restore | `ServiceWorkerArkadeSwaps.create({ serviceWorker: svcWallet.serviceWorker, swapRepository: new IndexedDbSwapRepository(), swapProvider, network, arkServerUrl, swapManager: connected })`. Swap persistence through `arkadeSwaps.swapRepository.saveSwap(swap)`. **Delete the 48h stale-swap cleanup loop** — match wallet/'s no-cleanup approach; trust the SW-hosted `SwapManager` to handle 404s with its built-in exponential backoff. | **High** — port from `../wallet/src/providers/swaps.tsx`. ~330 lines, can be simplified because chimera has no chain-swap UI. |
| 3 | `src/lib/types.ts` + callers | `PendingReverseSwap`, `PendingSubmarineSwap` | `BoltzReverseSwap`, `BoltzSubmarineSwap`. Removed from exports. Runtime shape unchanged. | **Easy** — rename ~12 call sites. |
| 4 | `src/providers/wallet.tsx:340` `resetWallet` | `svcWallet.contractRepository.clearContractData()` | `svcWallet.contractRepository.clear()` + `svcWallet.walletRepository.clear()` | **Trivial** — method rename. |
| 5 | `src/lib/backup.ts` | `ContractRepositoryImpl.getContractCollection('reverseSwaps')`, `saveToContractCollection('reverseSwaps', swap, 'id')`, etc. | `IndexedDbSwapRepository.getSwaps()` (or filtered) and `.saveSwap(swap)`. Consume `BoltzReverseSwap`/`BoltzSubmarineSwap`. | **Medium** — rewrite read/write helpers in `BackupProvider`. |
| 6 | `src/lib/indexer.ts` (commitmentTxs cache) | `ContractRepositoryImpl.getContractCollection('commitmentTxs')` / `saveToContractCollection(...)` | Two options: (a) keep the deprecated `ContractRepositoryImpl` — still works, only produces deprecation warnings; (b) replace with raw `IndexedDBStorageAdapter.getItem`/`setItem` (the cache is just a txid→timestamp array). **Recommended: (a) short-term, (b) later.** Non-swap data; not a correctness risk either way. | **Trivial** (a) / **Easy** (b). |
| 7 | `src/test/screens/mocks.ts` | Mocks `getContractCollection`/`saveToContractCollection` on `svcWallet.contractRepository` | Update mock shape to match the new `ContractRepository` interface (`clear()`, `saveContract()`, `getContracts()`, `deleteContract()`) and mock `IndexedDbSwapRepository` where needed. | **Easy**. |
| 8 | boltz-swap types removed | `RefundHandler`, `TimeoutConfig`, `RetryConfig`, `FeeConfig` | Config now lives inside `SwapManagerConfig` | chimera does not import any of these (grep-confirmed). **No change.** |

### 4b. Soft changes (backwards compatible, worth knowing)

- `ServiceWorkerWallet.setup({ serviceWorkerPath, identity, arkServerUrl, esploraUrl })` — **signature preserved**. New optional fields we should adopt while we're in there: `storage: { walletRepository, contractRepository }`, `settlementConfig: { vtxoThreshold }`, `messageTimeouts: { SETTLE: 60_000, SEND: 60_000 }`, `messageBusTimeoutMs`, `serviceWorkerActivationTimeoutMs`. See wallet's `providers/wallet.tsx:390-404` for the pattern.
- `SingleKey.fromHex()` — unchanged.
- `RestArkProvider`, `RestIndexerProvider`, `ArkNote`, `ArkAddress`, `VtxoManager`, `VtxoScript`, `hasBoardingTxExpired`, `IWallet`, `ExtendedCoin`, `ExtendedVirtualCoin`, `ArkInfo`, `FeeInfo`, `ScheduledSession`, `NetworkName`, `Coin`, `RelativeTimelock`, `Transaction`, `isVtxoExpiringSoon` — all still exported with compatible signatures.
- Predicates we already use (`isReverseFinalStatus`, `isSubmarineFinalStatus`, `isReverseClaimableStatus`, `isSubmarineSwapRefundable`, `getInvoiceSatoshis`, `BoltzSwapStatus`, `BoltzSwapProvider`, `SwapManager`, `FeesResponse`, `Network`, `setLogger`) — all still exported. Nice-to-adopt new predicates exist (`isReverseSuccessStatus`, `isSubmarineSuccessStatus`, `isReverseSwapClaimable`) but are optional.
- `SwapManagerClient` interface (what `arkadeSwaps.getSwapManager()` returns in the SW-hosted model) exposes `subscribeToSwapUpdates(swapId, callback)` — the same method our `components/SwapsList.tsx` already uses. API-compatible.

### 4c. Critical migration concern: existing users' swap data

Users upgrading will have historical swap records written by the old `ContractRepositoryImpl` under the IndexedDB store `arkade-service-worker`, collections `reverseSwaps` and `submarineSwaps`. The new `IndexedDbSwapRepository` uses a different object-store layout. **Without migration, these swaps disappear from the UI.**

The SDK ships `migrateToSwapRepository(legacyStorage, newRepo): Promise<boolean>` for exactly this. It's idempotent (writes a `migration-from-storage-adapter-swaps: done` flag). Wallet calls it during init:

```ts
const oldStorage = new IndexedDBStorageAdapter('arkade-service-worker')
// ...after ServiceWorkerWallet.setup(...)...
await migrateToSwapRepository(oldStorage, new IndexedDbSwapRepository())
```

**This is non-negotiable** to preserve user data.

## 5. Revised implementation plan

Constraint: converge on wallet's SW-hosted architecture. No main-thread `ArkadeLightning`.

### Phase 1 — dependency bump + mechanical renames (~1h, low risk)

1. `package.json`: set `@arkade-os/sdk@0.4.17`, `@arkade-os/boltz-swap@0.3.18`. Add `"pnpm": { "onlyBuiltDependencies": ["@arkade-os/sdk"] }` (needed for the SDK's better-sqlite3 optional dep post-install script).
2. `src/lib/types.ts` and all callers: `PendingReverseSwap` → `BoltzReverseSwap`, `PendingSubmarineSwap` → `BoltzSubmarineSwap` (~12 call sites across `lib/backup.ts`, `providers/flow.tsx`, `providers/lightning.tsx`, `screens/Apps/Boltz/Swap.tsx`, `components/SwapsList.tsx`). Runtime shape is identical.
3. `src/providers/wallet.tsx:340` `resetWallet`: `clearContractData()` → `clear()`, and add `svcWallet.walletRepository.clear()` below it.

### Phase 2 — rewrite the service worker entry (~2h, medium risk)

4. Rewrite `src/wallet-service-worker.ts`:
   - Replace `import { Worker } from '@arkade-os/sdk'; new Worker(); worker.start()` with:
     ```ts
     import { ArkadeSwapsMessageHandler, IndexedDbSwapRepository } from '@arkade-os/boltz-swap'
     import {
       IndexedDBWalletRepository,
       IndexedDBContractRepository,
       MessageBus,
       WalletMessageHandler,
     } from '@arkade-os/sdk'

     const walletRepository = new IndexedDBWalletRepository()
     const contractRepository = new IndexedDBContractRepository()
     const swapRepository = new IndexedDbSwapRepository()
     const worker = new MessageBus(walletRepository, contractRepository, {
       messageHandlers: [new WalletMessageHandler(), new ArkadeSwapsMessageHandler(swapRepository)],
       tickIntervalMs: 5000,
       messageTimeoutMs: 60_000,
     })
     worker.start().catch(console.error)
     ```
   - Keep chimera's existing `install`/`activate`/cache/`RELOAD_PAGE` handlers and the `'__BUILD_TIME__'` cache-busting — those are chimera-specific and unrelated to the SDK.
   - Drop the old `'RELOAD_WALLET'` message handler (`worker.reload()` path). The new `MessageBus` handles reload internally via the message bus request types. Verify that nothing in `providers/wallet.tsx` still posts `'RELOAD_WALLET'` after Phase 3.
   - Add the health-check `'PING'`/`'PONG'` handler from wallet (optional but catches dead SW faster):
     ```ts
     self.addEventListener('message', (event) => {
       if (event.data?.type === 'PING' && event.ports?.[0]) event.ports[0].postMessage({ type: 'PONG' })
     })
     ```

### Phase 3 — rewrite `providers/lightning.tsx` around `ServiceWorkerArkadeSwaps` (~4h, medium-high risk)

5. Port the structure of `../wallet/src/providers/swaps.tsx`, but **simplified to lightning-only**. Keep the file name and context name (`LightningContext`) so existing screens don't have to change imports.
   - Replace `new ArkadeLightning({...})` construction with:
     ```ts
     ServiceWorkerArkadeSwaps.create({
       serviceWorker: svcWallet.serviceWorker,
       swapRepository: new IndexedDbSwapRepository(),
       swapProvider: new BoltzSwapProvider({ apiUrl: baseUrl, network }),
       network,
       arkServerUrl: aspInfo.url,
       swapManager: config.apps.boltz.connected,
     })
     ```
   - Type the state as `ServiceWorkerArkadeSwaps | null`. Update the context method signatures to use `BoltzReverseSwap`/`BoltzSubmarineSwap`.
   - **Delete the 48h `startWithCleanup` stale-swap loop entirely** — match `../wallet/src/providers/swaps.tsx`. No pre-init status rewrites. Trust the SW-hosted `SwapManager` to handle 404s via its built-in exponential backoff (capped at 5 min). Accepted trade-off: a purged-from-Boltz swap older than 48h will sit in history with its last-known non-final status and continue to be polled at 5-min intervals indefinitely; deemed low severity vs. the maintenance cost and the code divergence from wallet. Also drop the `isReverseFinalStatus` / `isSubmarineFinalStatus` imports — unused after this simplification.
   - **Use `swapManager: config.apps.boltz.connected`** (plain boolean) instead of `{ autoStart: false }` + manual `startSwapManager()`. Without the pre-start cleanup there's no reason to defer auto-start. Matches wallet.
   - **Delete** the direct `IndexedDBStorageAdapter`/`ContractRepositoryImpl` usage. In `restoreSwaps`, use `arkadeSwaps.swapRepository.saveSwap(swap)` as wallet does.
   - Keep all chimera-specific context values (`calcSubmarineSwapFee`, `calcReverseSwapFee`, `toggleConnection`, `getApiUrl`, `payInvoice` 2-step flow with `sendOffChain` + `waitForSwapSettlement`) and the existing `LightningContext` shape so callers don't churn.
   - **Do not** add chain-swap methods (`createArkToBtcSwap`, `payBtc`, etc.) to the context — chimera has no UI for them. If we want to be defensive, filter out `swap.type === 'chain'` entries in `getSwapHistory` so a rogue chain swap can't crash `SwapsList`.
   - Retain the `feesFetchedForUrl` guard chimera added to prevent redundant fee fetches on re-renders.
   - `arkadeLightning` → `arkadeSwaps` internally, but keep the context property name `arkadeLightning` so `SwapsList` and `screens/Apps/Boltz/Swap.tsx` don't need to change. (Or rename context and update ~3 callers — either is fine; pick the smaller diff.)
   - **`swapManager` lifecycle:** `instance.getSwapManager()` in the SW-hosted world returns a `SwapManagerClient` proxy. PR #4 stores it in React state (`setSwapManager(instance.getSwapManager())`) rather than deriving it inline each render — safer if the proxy identity matters downstream. Either pattern works; pick one and stay consistent.
   - **Use `swap.id` not `swap.response.id`** for dedup in `restoreSwaps` — the new repo keys by top-level `id`.
   - Use `swapRepo.getAllSwaps({ type: 'reverse' | 'submarine' })` (new typed filter API) instead of the old `getContractCollection('reverseSwaps')`. Needed in Phase 5 as well.

   **Subscription APIs are now async (Phase 3/7 surface):**
   - `swapManager.onSwapUpdate(cb)` and `swapManager.subscribeToSwapUpdates(id, cb)` now return `Promise<() => void>`, not `() => void` — they proxy across the message bus. Callers that `return unsubscribe` from a `useEffect` break. Required pattern:
     ```ts
     let unsubscribe: (() => void) | null = null
     let cancelled = false
     swapManager.onSwapUpdate((swap) => { /* ... */ })
       .then((fn) => { if (cancelled) fn(); else unsubscribe = fn })
       .catch(consoleError)
     return () => { cancelled = true; if (unsubscribe) unsubscribe() }
     ```
     Affects `components/SwapsList.tsx` and `screens/Apps/Boltz/Swap.tsx` (Phase 7).

   **New `BoltzSwapStatus` values (Phase 7 surface):**
   - 0.3.18 adds `'transaction.server.mempool'` and `'transaction.server.confirmed'` to the `BoltzSwapStatus` union. `SwapsList.tsx`'s `statusDict satisfies Record<BoltzSwapStatus, statusUI>` fails TypeScript until both are mapped (both → `'Pending'`).

   **Response field nullability (Phase 7 surface):**
   - `response.onchainAmount`, `response.expectedAmount`, and `decodedInvoice.amountSats` are now `number | undefined` in 0.3.18/0.4.17. Every arithmetic/formatting call site needs `?? 0` or `?? satoshis`. Affects `components/SwapsList.tsx`, `screens/Apps/Boltz/Swap.tsx`, `screens/Wallet/Receive/QrCode.tsx`, `screens/Wallet/Receive/Amount.tsx`.

### Phase 4 — wire storage + migration into `providers/wallet.tsx` (~1h, low risk)

6. Adopt wallet's storage pattern in `providers/wallet.tsx`:
   - Create main-thread repositories alongside the SW:
     ```ts
     const walletRepository = new IndexedDBWalletRepository()
     const contractRepository = new IndexedDBContractRepository()
     ```
   - Pass them into `ServiceWorkerWallet.setup({ ..., storage: { walletRepository, contractRepository } })`. This keeps `svcWallet.walletRepository` / `svcWallet.contractRepository` consistent with what the SW uses.
   - Add `settlementConfig: { vtxoThreshold: wallet.thresholdMs ? Math.floor(wallet.thresholdMs / 1000) : 1 }` and `messageTimeouts: { SETTLE: 60_000, SEND: 60_000 }` (wallet's defaults — harmless even if we don't tune them).
7. **Migrate legacy swap data** (critical for existing users) right after `ServiceWorkerWallet.setup` resolves, before setting `svcWallet` into state:
   ```ts
   import { IndexedDBStorageAdapter } from '@arkade-os/sdk/adapters/indexedDB'
   import { IndexedDbSwapRepository, migrateToSwapRepository } from '@arkade-os/boltz-swap'

   try {
     const oldStorage = new IndexedDBStorageAdapter('arkade-service-worker')
     await migrateToSwapRepository(oldStorage, new IndexedDbSwapRepository())
   } catch (err) {
     consoleError(err, 'Error migrating swap repository')
   }
   ```
   The helper is idempotent (writes `migration-from-storage-adapter-swaps: done`), safe to run every startup.

### Phase 4b — SW init retry-storm hardening (~1-2h, high value, chimera-specific)

The v0.4 SDK service worker **lazily initializes** on the first incoming message. Inside that bootstrap, `buildServices` does an eager, CORS-sensitive `GET /v1/info`. If that call fails (ASP unreachable, CORS block, offline), the worker does **not** latch the failure — every subsequent message retries the full init, which re-fires `GET /v1/info`. Combined with chimera's current 1s `getStatus()` polling loop in `providers/wallet.tsx`, and with `Unlock.tsx`'s unlock effect that re-fires on every `WalletProvider` render (because `initWallet` is a context function recreated each render), this produces a measured **~60 req/s** hammer loop against the ASP until Arkade returns 429 (documented via HAR capture in PR #4).

This is not hypothetical — it will trigger on chimera as-is the first time a user opens the app with an unreachable ASP. Fixes below are required, not optional.

8. `src/providers/wallet.tsx`:
    - Export a new `ArkadeUnreachableError` class (`code = 'ARKADE_UNREACHABLE'`, carries the attempted URL).
    - In `initWallet`, before any SW-touching work: `if (aspInfo.unreachable || !aspInfo.url || !aspInfo.network) throw new ArkadeUnreachableError(aspInfo.url ?? '')`. Throw, don't silently return — callers must see the failure, otherwise `unlocked` gets set while `svcWallet` is `undefined` and downstream screens crash with `Cannot read properties of undefined (reading 'getAddress')`.
    - Replace the `setInterval(..., 1_000)` status ping with a backoff-aware loop: start at 1s until the first successful reading, then slow to 5s; track consecutive failures and `clearInterval` after 5 in a row. Log the halt reason ("Likely causes: ASP unreachable, CORS, or network offline") so triage is obvious.

9. `src/screens/Wallet/Unlock.tsx`:
    - Add a `useRef<boolean>(false)` re-entrancy guard (`unlockInFlight`) and flip it at the top of the unlock effect; release it in `.finally()`. `useState` is too slow — React's async commit lets the effect re-fire synchronously on the next render before the flag is observable.
    - Catch `ArkadeUnreachableError` in the unlock `.catch` and set a dedicated error message ("Arkade server unreachable. Check Settings → Arkade Server.") — **do not** fall through to "Invalid password", which is the current default and will be misleading.
    - **Drop `initWallet` from the effect's dependency array** (`eslint-disable-next-line react-hooks/exhaustive-deps`). It's a context function recreated on every `WalletProvider` render, so including it turns this effect into a render-rate loop that posts one `INITIALIZE_MESSAGE_BUS` per frame.

### Phase 5 — rewrite `lib/backup.ts` to read/write via `IndexedDbSwapRepository` (~1h, low risk)

8. Replace the module-level `new IndexedDBStorageAdapter('arkade-service-worker')` + `new ContractRepositoryImpl(storage)` with `new IndexedDbSwapRepository()`.
   - `contractRepo.getContractCollection('reverseSwaps')` → `swapRepo.getSwaps({ type: 'reverse' })` (verify filter syntax in `src/repositories/swap-repository.ts` of boltz-swap).
   - `contractRepo.saveToContractCollection('reverseSwaps', swap, 'id')` → `swapRepo.saveSwap(swap)` (the repo handles the key internally).
   - Same for submarine.
   - Update `NostrStorageData` type to use `BoltzReverseSwap`/`BoltzSubmarineSwap`.

### Phase 6 — `lib/indexer.ts` commitment-tx cache: move to a dedicated DB (~30min, mandatory)

**Corrected from earlier plan.** Keeping the cache on `IndexedDBStorageAdapter('arkade-service-worker')` + deprecated `ContractRepositoryImpl` does **not** work in v0.4 — the new `IndexedDBWalletRepository` / `IndexedDBContractRepository` instantiated by the SW and the main thread take over the `'arkade-service-worker'` database with a different object-store schema. Calls to the old `getContractCollection('commitmentTxs')` will throw **"One of the specified object stores was not found."**. PR #4 hit this directly.

10. `src/lib/indexer.ts`: change the storage DB name so the legacy schema and the new repositories don't collide:
    ```ts
    const storage = new IndexedDBStorageAdapter('arkade-indexer-cache')
    this.contractRepo = new ContractRepositoryImpl(storage)
    ```
    Deprecation warning remains (we still use the V1 class on the new DB), but the cache is now isolated and will function. The cache is write-on-miss, so losing the old cache on first load after upgrade is fine — it rebuilds lazily.

    (Alternative: replace the wrapper entirely with raw `storage.getItem(key)` / `storage.setItem(key, JSON.stringify(arr))`. Marginally cleaner, no deprecation. Optional — only do it if the rewrite is cheap.)

### Phase 7 — update tests, screens, and peripheral touchpoints (~2-3h)

11. `src/components/SwapsList.tsx`:
    - Add `'transaction.server.mempool': 'Pending'` and `'transaction.server.confirmed': 'Pending'` to `statusDict` (required for `satisfies Record<BoltzSwapStatus, statusUI>`).
    - `const sats = (swap.type === 'reverse' ? swap.response.onchainAmount : swap.response.expectedAmount) ?? 0` — nullable fallback.
    - Rewrite the `useEffect` that calls `swapManager.onSwapUpdate(cb)` using the async-unsubscribe pattern from Phase 3.
    - Filter `swap.type === 'chain'` out of the update handler (chimera has no chain-swap UI).

12. `src/screens/Apps/Boltz/Swap.tsx`:
    - Rewrite `swapManager.subscribeToSwapUpdates(swapInfo.id, cb)` using the async-unsubscribe pattern.
    - Filter `updatedSwap.type === 'chain'` in the callback.
    - `const amount = (isReverse ? swapInfo.response.onchainAmount : decodedInvoice.amountSats) ?? 0` — nullable fallback.

13. `src/screens/Wallet/Receive/QrCode.tsx` and `src/screens/Wallet/Receive/Amount.tsx`:
    - **Broadcast payload unwrap.** v0.4 wraps VTXO_UPDATE / UTXO_UPDATE data under `event.data.payload` instead of flat. Existing code reads `event.data.newVtxos` / `event.data.coins` directly (confirmed at `QrCode.tsx:101,105` and `Amount.tsx:204,208`) and will silently see `undefined`. Fix:
      ```ts
      const payload = event.data.payload ?? event.data
      // then payload?.newVtxos / payload?.coins with (payload?.newVtxos ?? []) guards
      ```
    - `QrCode.tsx`: `setRecvInfo({ ...recvInfo, satoshis: pendingSwap.response.onchainAmount ?? satoshis })` — nullable fallback.
    - `Amount.tsx`: same nullable fallback. Additionally, debounce `createReverseSwap(satoshis)` by ~700ms and invalidate any existing invoice when the amount changes — without this, each keystroke spawns a parallel swap and the first one to succeed (at Boltz's ≈10_000 sat minimum) wins, so the real amount is never requested. Pre-existing UX bug but clearly exposed by the SDK upgrade; worth fixing in the same PR.

14. `src/test/screens/mocks.ts`: update the `svcWallet.contractRepository` mock to match the new `ContractRepository` interface (`clear()`, `saveContract()`, `getContracts()`, `deleteContract()`). Remove `getContractCollection`/`saveToContractCollection` unless some test still hits the legacy `ContractRepositoryImpl` path.

15. `src/test/lib/utxo.test.ts`: uses `VtxoScript`, `hasBoardingTxExpired` — both unchanged. Should pass unmodified.

### Phase 8 — verification (~3-4h, do not skip)

16. `pnpm install && pnpm build` — expect zero TS errors after Phases 1-7.
17. **Fresh-wallet smoke test** (no legacy data): incognito window, onboard with a fresh mnemonic, confirm initial VTXO sync converges, balance appears. Send boarding tx on regtest, confirm settle works.
18. **Legacy-wallet migration test** (critical): copy over an IndexedDB snapshot from a pre-upgrade build that has at least one pending reverse swap and one submarine swap, upgrade in-place, confirm swaps show up in history after load. Verify the `migration-from-storage-adapter-swaps: done` flag is set afterwards (via devtools → Application → IndexedDB).
19. **Unreachable-ASP test** (regression guard for Phase 4b): set `VITE_ARK_SERVER` to a bogus URL and attempt unlock. Expected: `Unlock.tsx` shows "Arkade server unreachable" within a few seconds; network tab shows a small, bounded number of `/v1/info` requests (not ~60 req/s); ping loop halts after 5 failures with the telltale log line. **This is the specific failure mode PR #4 was trying to fix.**
20. **Boltz end-to-end on regtest**:
    - Submarine swap: generate invoice externally, pay from chimera, confirm preimage arrives and swap marks success.
    - Reverse swap: generate invoice in chimera, pay it externally, confirm vHTLC claim succeeds.
    - Refund path: let a submarine swap time out; confirm the refund UI flow works.
    - Incoming-payment notification on Receive screens: confirm the `event.data.payload` unwrap fires `notifyPaymentReceived` / updates the success route (regression guard for broadcast shape change).
21. **SW lifecycle**:
    - Close tab for >5 minutes then reopen — swap polling should have continued in the SW and statuses should be current.
    - Reload during active swap — swap resumes watching.
    - `resetWallet` (Settings → Advanced → Reset): confirm `clear()` calls don't throw and the DB is empty afterwards.
22. Run `pnpm test:e2e` (playwright). Fix any test that hits the old mock shape.
23. Manual pass on non-Boltz flows (send on-chain, send Lightning, receive, notes, KYC link, deep links) — no SDK change there, but low-cost sanity check.
24. **Reproduce PR #4's broken state** (diagnostic): `git fetch origin pull/4/head:pr-4-upgrade-sdk && git checkout pr-4-upgrade-sdk && pnpm install && pnpm start`. Exercise the same flows as above and note what breaks that our implementation doesn't — gives us an early signal on the remaining unknown failure mode.

## 6. Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| SW message-bus activation flakiness on first cold start after upgrade | Medium | Keep chimera's existing retry-with-backoff in `initSvcWorkerWallet`. Add the `PING/PONG` health check from wallet so a dead SW is detected before `ServiceWorkerWallet.setup` times out (wallet does a `serviceWorker.getRegistration()` → PING → unregister-if-dead dance; worth porting if flakes appear). |
| Retry storm: ~60 req/s to `/v1/info` when ASP is unreachable | **High** | Root cause is v0.4's lazy-init + chimera's 1s `getStatus` ping + `Unlock.tsx` effect re-firing on every render. Phase 4b adds `ArkadeUnreachableError`, ping-loop backoff (5s after success, stop after 5 failures), and an `unlockInFlight` `useRef` guard with `initWallet` dropped from the unlock effect's deps. **Do not skip Phase 4b** — this triggers on any user whose ASP is temporarily down. |
| IndexedDB schema collision in `lib/indexer.ts` | **High** | v0.4 repos take over the `'arkade-service-worker'` database with a different schema; the legacy `getContractCollection` throws "object stores was not found". Phase 6 moves the commitment-tx cache to `'arkade-indexer-cache'`. Straightforward but non-optional. |
| Broadcast payload shape change breaks payment detection | Medium | `VTXO_UPDATE` / `UTXO_UPDATE` messages now wrap data under `event.data.payload`. Silent failure mode: incoming-payment notifications stop firing on the Receive screens. Phase 7 step 13 adds the `event.data.payload ?? event.data` unwrap in both `QrCode.tsx` and `Amount.tsx`. |
| Subscription APIs changed sync→async | Medium | `onSwapUpdate` and `subscribeToSwapUpdates` now return `Promise<() => void>`. Silent failure mode: components unmount with stale subscriptions, memory leak + stale UI. Phase 3 establishes the async-unsubscribe pattern; Phase 7 applies it to `SwapsList.tsx` and `Apps/Boltz/Swap.tsx`. |
| New `BoltzSwapStatus` values break `satisfies` check | Low | Compile-time failure in `SwapsList.tsx`. Add `'transaction.server.mempool'` and `'transaction.server.confirmed'` (both → `'Pending'`). |
| Legacy swap data loss on upgrade | High | Phase 4 step 7 runs `migrateToSwapRepository` on every init. Test with a real pre-upgrade IndexedDB snapshot (step 16). |
| Purged-from-Boltz swaps sit as "pending" in history | Low | Chimera's old 48h status-rewrite cleanup is being **removed** in Phase 3 to match wallet/. The new `SwapManager` backs off 404s to a 5-min poll interval (not stopped, just throttled). Accepted trade-off: a swap Boltz purged after 24-48h will show "pending" in history forever and incur a 5-min background poll. Low user impact, high simplicity win from matching wallet. If the UX becomes a real complaint, reintroduce the cleanup against `swapRepository.saveSwap({ ...swap, status: 'swap.expired' })` — but only then. |
| `svcWallet.contractRepository` interface is now the new `ContractRepository` not `ContractRepositoryImpl` | Low | Only one call site (`resetWallet`). Renamed in Phase 1 step 3. |
| Chain swaps leaking into `SwapsList` | Low | Defensive filter in Phase 3 step 5. Chimera's UI has no chain-swap views. |
| `lib/backup.ts` Nostr restore semantics change | Medium | Backup format still stores `{reverseSwaps, submarineSwaps}` arrays in JSON — we only change how they're persisted locally after decode. Verify round-trip: backup → wipe → restore → swap list non-empty. |
| Mixed versions break the build | High | Never bump only one package. Enforce via a single PR that touches both. |

## 7. Summary

- **~90% of chimera's SDK surface is compatible** at the import level. The upgrade work is concentrated in three files: the SW entry, the swap provider, and the wallet provider.
- **Architecturally, this matches wallet/** — we remove the main-thread swap loop, its duplicate IndexedDB access, **and the 48h stale-swap cleanup hack**. The new SW-hosted `SwapManager` backs off 404s to 5-min polls; we accept the trade-off that purged-from-Boltz swaps render "pending forever" rather than maintaining custom cleanup that diverges from wallet/.
- **Biggest risks:** (a) legacy swap data migration — solved by `migrateToSwapRepository`, (b) SW activation flakiness on the first cold start — solved by keeping the existing retry plus the PING health-check.
- **UX/UI code is untouched** on the mandatory path. All fork-specific features (KYC, Apps, analytics, Intercom, price charts, etc.) live outside the SDK boundary and are not affected.
- **Order matters:** Phase 1 → 2 → 3 → 4 → 4b → 5 → 6 → 7 → 8. Phase 2 must land before Phase 3 because the SW handler is a prerequisite for `ServiceWorkerArkadeSwaps.create()` to have someone to talk to. Phase 4b (retry-storm hardening) and Phase 6 (indexer DB split) are both non-optional — skipping them produces broken states that are either user-facing (retry storm) or compile-time (object-store-not-found thrown at runtime on first cache read).
- **Known unknowns:** PR #4 is still broken after 3 iterative fix commits that cover every item in Phases 3–7 above. That means there is at least one more failure mode we haven't identified. Plan to allocate extra time in Phase 8 for diagnosing whatever surfaces, and consider checking out the PR branch to reproduce its broken state before committing to our own implementation, so we know what to look out for.
