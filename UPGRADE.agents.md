# Upgrade plan: `@arkade-os/sdk` 0.3.12 → 0.4.17 and `@arkade-os/boltz-swap` 0.2.19 → 0.3.18

Reference wallet: `../wallet` (already on the target versions, uses the service-worker-hosted swap architecture). Goal is to upgrade chimera-wallet-pwa without breaking UX/UI, and to converge on the same service-worker architecture — **no main-thread workarounds for swap handling**.

## 1. Scope

| Package | Chimera (current) | Target | Jump |
|---|---|---|---|
| `@arkade-os/sdk` | 0.3.12 | 0.4.17 | 229 commits; major-like |
| `@arkade-os/boltz-swap` | 0.2.19 | 0.3.18 | 294 commits; major-like |

**Hard coupling:** boltz-swap 0.3.x requires sdk ≥ 0.4.16. Bump together.

**Architectural constraint added:** follow `../wallet`'s pattern where all swap processing lives inside the service worker (`ArkadeSwapsMessageHandler` + `ServiceWorkerArkadeSwaps`) and main-thread code talks to it via the message bus. This eliminates the current main-thread `new ArkadeLightning({...})` + raw `ContractRepositoryImpl` cleanup loop in `providers/lightning.tsx`.

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
    └── IndexedDBStorageAdapter (raw, or keep deprecated ContractRepositoryImpl
        for the commitmentTxs KV cache — it's unrelated to swap data)
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
| 2 | `src/providers/lightning.tsx` | Main-thread `new ArkadeLightning({...})` + manual stale-swap cleanup + direct `IndexedDBStorageAdapter`/`ContractRepositoryImpl` usage for restore | `ServiceWorkerArkadeSwaps.create({ serviceWorker: svcWallet.serviceWorker, swapRepository: new IndexedDbSwapRepository(), swapProvider, network, arkServerUrl, swapManager: connected })`. Swap persistence through `arkadeSwaps.swapRepository.saveSwap(swap)`. Port the 48h stale-swap cleanup loop against the new `IndexedDbSwapRepository`. | **High** — port from `../wallet/src/providers/swaps.tsx`. ~330 lines, can be simplified because chimera has no chain-swap UI. |
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
   - **Port (don't delete)** the `startWithCleanup` stale-swap loop. Clarification on what it does: it is a **status rewrite, not DB eviction** — it iterates non-final swaps older than 48h and overwrites their `status` field to `'swap.expired'` (a terminal status the new `SwapManager` recognizes). Rows stay in the DB with the same key; only `status` changes. The swap remains visible in history as "expired/failed" and is correctly excluded from the monitor's pending set on next start.

     Why keep it: the new `SwapManager` does *not* convert Boltz 404 responses into a local `'swap.expired'` write. A swap Boltz has purged continues to be polled with exponential backoff up to `maxPollRetryDelayMs` (5 min) — throttled, not stopped. Without the cleanup, such swaps also render as "pending forever" in the UI. Porting the cleanup is cheap and defensive.

     New shape (runs in `providers/lightning.tsx` *before* calling `ServiceWorkerArkadeSwaps.create({ swapManager: connected })`, using a directly-instantiated repo):
     ```ts
     const swapRepository = new IndexedDbSwapRepository()
     if (config.apps.boltz.connected) {
       const STALE_SECONDS = 48 * 60 * 60
       const staleThreshold = Math.floor(Date.now() / 1000) - STALE_SECONDS
       const swaps = await swapRepository.getSwaps()
       const staleSwaps = swaps.filter((s) => {
         const isNonFinal =
           s.type === 'reverse' ? !isReverseFinalStatus(s.status) : !isSubmarineFinalStatus(s.status)
         return isNonFinal && s.createdAt < staleThreshold
       })
       for (const swap of staleSwaps) {
         await swapRepository.saveSwap({ ...swap, status: 'swap.expired' })
       }
     }
     // then: await ServiceWorkerArkadeSwaps.create({ ..., swapRepository, swapManager: connected })
     ```
     Pass the same `swapRepository` instance into `ServiceWorkerArkadeSwaps.create(...)` so the SW-resident manager sees the already-updated statuses at startup.
   - **Delete** the direct `IndexedDBStorageAdapter`/`ContractRepositoryImpl` usage. In `restoreSwaps`, use `arkadeSwaps.swapRepository.saveSwap(swap)` as wallet does.
   - Keep all chimera-specific context values (`calcSubmarineSwapFee`, `calcReverseSwapFee`, `toggleConnection`, `getApiUrl`, `payInvoice` 2-step flow with `sendOffChain` + `waitForSwapSettlement`) and the existing `LightningContext` shape so callers don't churn.
   - **Do not** add chain-swap methods (`createArkToBtcSwap`, `payBtc`, etc.) to the context — chimera has no UI for them. If we want to be defensive, filter out `swap.type === 'chain'` entries in `getSwapHistory` so a rogue chain swap can't crash `SwapsList`.
   - Retain the `feesFetchedForUrl` guard chimera added to prevent redundant fee fetches on re-renders.
   - `arkadeLightning` → `arkadeSwaps` internally, but keep the context property name `arkadeLightning` so `SwapsList` and `screens/Apps/Boltz/Swap.tsx` don't need to change. (Or rename context and update ~3 callers — either is fine; pick the smaller diff.)

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

### Phase 5 — rewrite `lib/backup.ts` to read/write via `IndexedDbSwapRepository` (~1h, low risk)

8. Replace the module-level `new IndexedDBStorageAdapter('arkade-service-worker')` + `new ContractRepositoryImpl(storage)` with `new IndexedDbSwapRepository()`.
   - `contractRepo.getContractCollection('reverseSwaps')` → `swapRepo.getSwaps({ type: 'reverse' })` (verify filter syntax in `src/repositories/swap-repository.ts` of boltz-swap).
   - `contractRepo.saveToContractCollection('reverseSwaps', swap, 'id')` → `swapRepo.saveSwap(swap)` (the repo handles the key internally).
   - Same for submarine.
   - Update `NostrStorageData` type to use `BoltzReverseSwap`/`BoltzSubmarineSwap`.

### Phase 6 — `lib/indexer.ts` commitment-tx cache (~15min, trivial)

9. This module caches txid → endedAt timestamps. It's **not swap data**. Recommended: keep using the deprecated `ContractRepositoryImpl` for now — it still ships and works. Accept the deprecation warning. File a follow-up ticket to replace with raw `IndexedDBStorageAdapter.getItem/setItem` (one key holds the full array).

### Phase 7 — update tests and peripheral touchpoints (~1h)

10. `src/test/screens/mocks.ts`: update the `svcWallet.contractRepository` mock to match the new `ContractRepository` interface (`clear()`, `saveContract()`, `getContracts()`, `deleteContract()`). Remove `getContractCollection`/`saveToContractCollection` unless some test still hits the legacy `ContractRepositoryImpl` path.
11. `src/components/SwapsList.tsx`: confirm it consumes `BoltzReverseSwap | BoltzSubmarineSwap` shape (unchanged at runtime). If we filter chain swaps in `getSwapHistory` (Phase 3), nothing else changes.
12. `src/screens/Apps/Boltz/Swap.tsx`: uses `isReverseClaimableStatus`, `isSubmarineSwapRefundable`, `subscribeToSwapUpdates`. All still exported. The `swapManager` now comes from `arkadeSwaps.getSwapManager()` which returns a `SwapManagerClient` (proxy over the SW), API-compatible.
13. `src/test/lib/utxo.test.ts`: uses `VtxoScript`, `hasBoardingTxExpired` — both unchanged. Should pass unmodified.

### Phase 8 — verification (~3-4h, do not skip)

14. `pnpm install && pnpm build` — expect zero TS errors after Phases 1-7.
15. **Fresh-wallet smoke test** (no legacy data): incognito window, onboard with a fresh mnemonic, confirm initial VTXO sync converges, balance appears. Send boarding tx on regtest, confirm settle works.
16. **Legacy-wallet migration test** (critical): copy over an IndexedDB snapshot from a pre-upgrade build that has at least one pending reverse swap and one submarine swap, upgrade in-place, confirm swaps show up in history after load. Verify the `migration-from-storage-adapter-swaps: done` flag is set afterwards (via devtools → Application → IndexedDB).
17. **Boltz end-to-end on regtest**:
    - Submarine swap: generate invoice externally, pay from chimera, confirm preimage arrives and swap marks success.
    - Reverse swap: generate invoice in chimera, pay it externally, confirm vHTLC claim succeeds.
    - Refund path: let a submarine swap time out; confirm the refund UI flow works.
18. **SW lifecycle**:
    - Close tab for >5 minutes then reopen — swap polling should have continued in the SW and statuses should be current.
    - Reload during active swap — swap resumes watching.
    - `resetWallet` (Settings → Advanced → Reset): confirm `clear()` calls don't throw and the DB is empty afterwards.
19. Run `pnpm test:e2e` (playwright). Fix any test that hits the old mock shape.
20. Manual pass on non-Boltz flows (send on-chain, send Lightning, receive, notes, KYC link, deep links) — no SDK change there, but low-cost sanity check.

## 6. Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| SW message-bus activation flakiness on first cold start after upgrade | Medium | Keep chimera's existing retry-with-backoff in `initSvcWorkerWallet`. Add the `PING/PONG` health check from wallet so a dead SW is detected before `ServiceWorkerWallet.setup` times out (wallet does a `serviceWorker.getRegistration()` → PING → unregister-if-dead dance; worth porting if flakes appear). |
| Legacy swap data loss on upgrade | High | Phase 4 step 7 runs `migrateToSwapRepository` on every init. Test with a real pre-upgrade IndexedDB snapshot (step 16). |
| Stale-swap cleanup semantics | Low | The cleanup is a **status rewrite**, not DB eviction — it updates `status → 'swap.expired'` on rows older than 48h with non-final status. Ported to the new `IndexedDbSwapRepository` in Phase 3 (runs before `ServiceWorkerArkadeSwaps.create`). Reason for keeping: the new `SwapManager` backs off on 404s (5-min cap) but doesn't auto-expire purged swaps. Validate by leaving a forced-404 swap in the DB during testing and confirming it's marked expired on next load (not runaway polled). |
| `svcWallet.contractRepository` interface is now the new `ContractRepository` not `ContractRepositoryImpl` | Low | Only one call site (`resetWallet`). Renamed in Phase 1 step 3. |
| Chain swaps leaking into `SwapsList` | Low | Defensive filter in Phase 3 step 5. Chimera's UI has no chain-swap views. |
| `lib/backup.ts` Nostr restore semantics change | Medium | Backup format still stores `{reverseSwaps, submarineSwaps}` arrays in JSON — we only change how they're persisted locally after decode. Verify round-trip: backup → wipe → restore → swap list non-empty. |
| Mixed versions break the build | High | Never bump only one package. Enforce via a single PR that touches both. |

## 7. Summary

- **~90% of chimera's SDK surface is compatible** at the import level. The upgrade work is concentrated in three files: the SW entry, the swap provider, and the wallet provider.
- **Architecturally, this matches wallet/** and removes the main-thread swap loop and its duplicate IndexedDB access. The 48h stale-swap status-rewrite is preserved (ported to the new repo) because the new `SwapManager` only backs off on 404s — it doesn't auto-expire purged swaps.
- **Biggest risks:** (a) legacy swap data migration — solved by `migrateToSwapRepository`, (b) SW activation flakiness on the first cold start — solved by keeping the existing retry plus the PING health-check.
- **UX/UI code is untouched** on the mandatory path. All fork-specific features (KYC, Apps, analytics, Intercom, price charts, etc.) live outside the SDK boundary and are not affected.
- **Order matters:** Phase 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Phase 2 must land before Phase 3 because the SW handler is a prerequisite for `ServiceWorkerArkadeSwaps.create()` to have someone to talk to.
