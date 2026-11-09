import { getPublicKey } from 'nostr-tools/pure'
import { NostrStorage } from './nostr'
import { Config } from './types'
import { consoleError } from './logs'
import { toXOnlyHex } from './keys'

/**
 * What this backup writes and reads. Events written by older versions also
 * carry Boltz swap arrays (`reverseSwaps`, `submarineSwaps`, `chainSwaps`);
 * those keys are no longer read, so an old backup still restores its config.
 */
type NostrStorageData = {
  config?: Config
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
      this.pubkey = toXOnlyHex(options.pubkey)
      if (this.pubkey.length !== 64) throw new Error('Invalid pubkey length')
      this.nostrStorage = new NostrStorage({ pubkey: this.pubkey })
      this.seckey = null
    } else {
      throw new Error('Either seckey or pubkey must be provided')
    }
  }

  /**
   * Backup config to Nostr
   * @param config Config to backup
   */
  backupConfig = async (config: Config) => {
    const data: NostrStorageData = { config }
    await this.nostrStorage.save(JSON.stringify(data))
  }

  /**
   * Restore data from Nostr
   * @param updateConfig func to update Config
   */
  restore = async (updateConfig: (config: Config) => void) => {
    const data = await this.loadData()
    if (data?.config) updateConfig(data.config)
  }

  /**
   * Initially data was saved in a unique event, until we reached the size limit.
   * Now we can have multiple events, so we need to load and merge them.
   * Events are sorted by created_at to have a deterministic order, so the
   * latest config wins.
   * @returns Data stored on Nostr
   */
  private loadData = async (): Promise<NostrStorageData> => {
    let config: Config | undefined

    const events = await this.nostrStorage.load()

    // Events are sorted by created_at to have a deterministic order.
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
      if (data?.config) config = data.config
    }

    return { config }
  }
}
