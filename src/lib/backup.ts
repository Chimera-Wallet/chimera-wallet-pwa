import { getPublicKey } from 'nostr-tools/pure'
import type { LocalCardInput } from '@arkade-os/solver-discovery'
import { BackupEvent, NostrStorage } from './nostr'
import { Config } from './types'
import { consoleError } from './logs'
import { toXOnlyHex } from './keys'
import type { AddressBookEntry } from './addressBook'

/**
 * What one backup event may carry. Each event holds any subset of these keys.
 * `config` and `solverCards` restore from the newest event that has them.
 * The address book is instead combined across every event, minus the ids in
 * any `addressBookDeleted`: a device whose restore timed out (load gives up
 * after 10s) and then saved one new contact must not hide the contacts every
 * earlier event holds. Deleted ids are what keep a deletion from coming back.
 *
 * Builds still in production read only `config` and ignore the other keys, so
 * events written here stay readable by them (beta shares these backups).
 * Events from older versions also carry Boltz swap arrays (`reverseSwaps`,
 * `submarineSwaps`, `chainSwaps`); those keys are no longer read.
 *
 * Bank details never go in here: Config is kept free of them on purpose, and
 * the address book holds only Ark/Bitcoin addresses.
 */
export type NostrBackupData = {
  config?: Config
  addressBook?: AddressBookEntry[]
  addressBookDeleted?: string[]
  solverCards?: LocalCardInput[]
}

export type RestoreHandlers = {
  config?: (config: Config) => void
  addressBook?: (entries: AddressBookEntry[], deletedIds: string[]) => void
  solverCards?: (cards: LocalCardInput[]) => void
}

/**
 * What a set of backup events restores to (see NostrBackupData for the rules). An event ranks by
 * the earlier of its own timestamp and its arrival, so a clock set in the future
 * can't pin a stale value on top; ids break ties.
 */
export const mergeBackupEvents = (events: BackupEvent[]): NostrBackupData => {
  const sortKey = (e: BackupEvent) => Math.min(e.created_at, e.receivedAt)
  const sorted = [...events].sort((a, b) => sortKey(a) - sortKey(b) || a.id.localeCompare(b.id))

  const merged: NostrBackupData = {}
  const entries = new Map<string, AddressBookEntry>()
  const deleted = new Set<string>()
  let hasAddressBook = false
  for (const event of sorted) {
    if (!event.content) continue
    let data: NostrBackupData | null = null
    try {
      data = JSON.parse(event.content) as NostrBackupData
    } catch (err) {
      consoleError(err, 'Failed to parse Nostr backup event')
      continue
    }
    if (!data || typeof data !== 'object') continue
    if (data.config) merged.config = data.config
    if (Array.isArray(data.addressBook)) {
      hasAddressBook = true
      // Later events win for the same id. Validation happens on restore.
      for (const entry of data.addressBook) {
        if (entry && typeof entry.id === 'string') entries.set(entry.id, entry)
      }
    }
    if (Array.isArray(data.addressBookDeleted)) {
      hasAddressBook = true
      for (const id of data.addressBookDeleted) if (typeof id === 'string') deleted.add(id)
    }
    if (Array.isArray(data.solverCards)) merged.solverCards = data.solverCards
  }
  if (hasAddressBook) {
    merged.addressBook = [...entries.values()].filter((entry) => !deleted.has(entry.id))
    merged.addressBookDeleted = [...deleted]
  }
  return merged
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

  private save = async (data: NostrBackupData) => {
    await this.nostrStorage.save(JSON.stringify(data))
  }

  /** Back up config to Nostr. */
  backupConfig = async (config: Config) => this.save({ config })

  /** Back up the whole address book and the ids deleted from it. */
  backupAddressBook = async (addressBook: AddressBookEntry[], addressBookDeleted: string[]) =>
    this.save({ addressBook, addressBookDeleted })

  /** Back up every network's solver cards. */
  backupSolverCards = async (solverCards: LocalCardInput[]) => this.save({ solverCards })

  /**
   * Back up everything in one event, e.g. when backups are switched on. An
   * empty card list is left out rather than written, so it can't blank out
   * cards an earlier event holds (the address book can't be blanked: it merges).
   */
  fullBackup = async (data: {
    config: Config
    addressBook: AddressBookEntry[]
    addressBookDeleted: string[]
    solverCards: LocalCardInput[]
  }) => {
    const payload: NostrBackupData = {
      config: data.config,
      addressBook: data.addressBook,
      addressBookDeleted: data.addressBookDeleted,
    }
    if (data.solverCards.length) payload.solverCards = data.solverCards
    await this.save(payload)
  }

  /**
   * Restore data from Nostr, handing each restored part to its handler.
   * Needs the secret key (only the owner can decrypt).
   */
  restore = async (handlers: RestoreHandlers) => {
    const data = mergeBackupEvents(await this.nostrStorage.load())
    if (data.config) handlers.config?.(data.config)
    if (data.addressBook) handlers.addressBook?.(data.addressBook, data.addressBookDeleted ?? [])
    if (data.solverCards) handlers.solverCards?.(data.solverCards)
  }
}
