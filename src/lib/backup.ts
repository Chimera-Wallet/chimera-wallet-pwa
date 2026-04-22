import { BoltzReverseSwap, BoltzSubmarineSwap, IndexedDbSwapRepository } from '@arkade-os/boltz-swap'
import { getPublicKey } from 'nostr-tools/pure'
import { NostrStorage } from './nostr'
import { Config } from './types'
import { consoleError } from './logs'

const swapRepo = new IndexedDbSwapRepository('arkade-swaps')

type NostrStorageData = {
  config?: Config
  reverseSwaps?: BoltzReverseSwap[]
  submarineSwaps?: BoltzSubmarineSwap[]
}
export class BackupProvider {
  private nostrStorage: NostrStorage
  private seckey: Uint8Array | null
  private pubkey: string

  /**
   * Initialize Backup with either a secret key or public key
   * @param options.seckey - Optional secret key (Uint8Array). If provided, pubkey is derived.
   * @param options.pubkey - Optional public key (hex string). Required if seckey not provided.
   * @throws Error if neither seckey nor pubkey is provided, or if pubkey format is invalid
   */
  constructor(options: { pubkey?: string; seckey?: Uint8Array }) {
    if (options.seckey) {
      this.pubkey = getPublicKey(options.seckey)
      this.seckey = options.seckey
      this.nostrStorage = new NostrStorage({ seckey: this.seckey })
    } else if (options.pubkey) {
      this.pubkey = options.pubkey
      if (this.pubkey.length === 66) this.pubkey = options.pubkey.slice(2)
      if (this.pubkey.length !== 64) throw new Error('Invalid pubkey length')
      this.nostrStorage = new NostrStorage({ pubkey: this.pubkey })
      this.seckey = null
    } else {
      throw new Error('Either seckey or pubkey must be provided')
    }
  }

  backupConfig = async (config: Config) => {
    const data: NostrStorageData = { config }
    await this.nostrStorage.save(JSON.stringify(data))
  }

  backupReverseSwap = async (reverseSwap: BoltzReverseSwap) => {
    const data: NostrStorageData = { reverseSwaps: [reverseSwap] }
    await this.nostrStorage.save(JSON.stringify(data))
  }

  backupSubmarineSwap = async (submarineSwap: BoltzSubmarineSwap) => {
    const data: NostrStorageData = { submarineSwaps: [submarineSwap] }
    await this.nostrStorage.save(JSON.stringify(data))
  }

  fullBackup = async (config: Config) => {
    const reverseSwaps = await swapRepo.getAllSwaps<BoltzReverseSwap>({ type: 'reverse' })
    const submarineSwaps = await swapRepo.getAllSwaps<BoltzSubmarineSwap>({ type: 'submarine' })
    const data: NostrStorageData = {
      config,
      reverseSwaps,
      submarineSwaps,
    }

    const dataSize = JSON.stringify(data).length

    if (dataSize > 65000) {
      if (config) await this.backupConfig(config)

      for (const reverseSwap of data.reverseSwaps ?? []) {
        await this.backupReverseSwap(reverseSwap)
      }

      for (const submarineSwap of data.submarineSwaps ?? []) {
        await this.backupSubmarineSwap(submarineSwap)
      }
    } else {
      await this.nostrStorage.save(JSON.stringify(data))
    }
  }

  restore = async (updateConfig: (config: Config) => void) => {
    const data = (await this.loadData()) as NostrStorageData

    if (data?.config) updateConfig(data.config)

    for (const swap of data?.reverseSwaps ?? []) {
      await swapRepo.saveSwap(swap)
    }

    for (const swap of data?.submarineSwaps ?? []) {
      await swapRepo.saveSwap(swap)
    }
  }

  private loadData = async (): Promise<NostrStorageData> => {
    const loaded = {
      config: null as Config | null,
      reverseSwaps: new Map<string, BoltzReverseSwap>(),
      submarineSwaps: new Map<string, BoltzSubmarineSwap>(),
    }

    const events = await this.nostrStorage.load()

    const sorted = events.sort((a, b) => a.created_at - b.created_at)

    for (const event of sorted) {
      if (!event.content) continue

      let data: NostrStorageData | null = null
      try {
        data = JSON.parse(event.content) as NostrStorageData
      } catch (err) {
        consoleError(err, 'Failed to parse Nostr backup event')
        continue
      }
      if (!data) continue

      if (data.config) loaded.config = data.config

      for (const swap of data.reverseSwaps ?? []) {
        loaded.reverseSwaps.set(swap.id, swap)
      }

      for (const swap of data.submarineSwaps ?? []) {
        loaded.submarineSwaps.set(swap.id, swap)
      }
    }

    return {
      config: loaded.config ?? undefined,
      reverseSwaps: Array.from(loaded.reverseSwaps.values()),
      submarineSwaps: Array.from(loaded.submarineSwaps.values()),
    }
  }
}
