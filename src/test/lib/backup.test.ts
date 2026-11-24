import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateSecretKey } from 'nostr-tools'
import { mergeBackupEvents } from '../../lib/backup'
import { type BackupEvent, NostrStorage, parseNostrRelays } from '../../lib/nostr'
import {
  AddressBookEntry,
  AddressType,
  addAddress,
  getAddressBook,
  getDeletedAddressIds,
  onAddressBookChange,
  removeAddress,
  removeContact,
  restoreAddressBook,
} from '../../lib/addressBook'
import { getMissingRequiredConfig } from '../../lib/requiredConfig'

const entry = (id: string, contact: string | null = 'Alice'): AddressBookEntry => ({
  id,
  type: AddressType.Ark,
  address: `tark1${id}`,
  contact,
  createdAt: 1,
})

let seq = 0
const event = (content: object, createdAt: number): BackupEvent =>
  ({
    id: `id-${seq++}`,
    content: JSON.stringify(content),
    created_at: createdAt,
    receivedAt: 10_000,
  }) as BackupEvent

describe('mergeBackupEvents', () => {
  it('takes config from the newest event that has one', () => {
    const merged = mergeBackupEvents([
      event({ config: { fiat: 'USD' } }, 2),
      event({ config: { fiat: 'EUR' } }, 1),
      event({ addressBook: [] }, 3),
    ])
    expect(merged.config).toEqual({ fiat: 'USD' })
  })

  it('combines address book events so a short newer list hides nothing', () => {
    // A device whose restore timed out saved one contact on top of older ones
    const merged = mergeBackupEvents([
      event({ addressBook: [entry('a'), entry('b')], addressBookDeleted: [] }, 1),
      event({ addressBook: [entry('c')], addressBookDeleted: [] }, 2),
    ])
    expect(merged.addressBook?.map((e) => e.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('keeps deletions deleted across events', () => {
    const merged = mergeBackupEvents([
      event({ addressBook: [entry('a'), entry('b')] }, 1),
      event({ addressBook: [entry('b')], addressBookDeleted: ['a'] }, 2),
    ])
    expect(merged.addressBook?.map((e) => e.id)).toEqual(['b'])
    expect(merged.addressBookDeleted).toEqual(['a'])
  })

  it('lets the newest version of an edited entry win', () => {
    const merged = mergeBackupEvents([
      event({ addressBook: [{ ...entry('a'), label: 'old' }] }, 1),
      event({ addressBook: [{ ...entry('a'), label: 'new' }] }, 2),
    ])
    expect(merged.addressBook).toEqual([{ ...entry('a'), label: 'new' }])
  })

  it('reads backups written before the address book existed', () => {
    const merged = mergeBackupEvents([event({ config: { fiat: 'USD' }, reverseSwaps: [] }, 1)])
    expect(merged.config).toEqual({ fiat: 'USD' })
    expect(merged.addressBook).toBeUndefined()
  })

  it('skips unparseable events', () => {
    const bad = { ...event({}, 1), content: 'not json' } as BackupEvent
    expect(mergeBackupEvents([bad, event({ config: { fiat: 'EUR' } }, 2)]).config).toEqual({ fiat: 'EUR' })
  })
})

describe('address book deletions and restore', () => {
  beforeEach(() => localStorage.clear())

  it('records deleted ids and tells listeners about every save', () => {
    const listener = vi.fn()
    const unsubscribe = onAddressBookChange(listener)
    const a = addAddress({ type: AddressType.Ark, address: 'tark1a', contact: 'Alice' })
    const b = addAddress({ type: AddressType.Ark, address: 'tark1b', contact: 'Bob' })
    removeAddress(a.id)
    removeContact('Bob')
    unsubscribe()

    expect(listener).toHaveBeenCalledTimes(4)
    expect(listener).toHaveBeenLastCalledWith([])
    expect(getDeletedAddressIds().sort()).toEqual([a.id, b.id].sort())
  })

  it('adds backed-up entries without overwriting local ones or reviving deletions', () => {
    localStorage.setItem('address_book', JSON.stringify([{ ...entry('a'), label: 'local' }]))
    localStorage.setItem('address_book_deleted', JSON.stringify(['gone']))
    const listener = vi.fn()
    const unsubscribe = onAddressBookChange(listener)

    const added = restoreAddressBook(
      [{ ...entry('a'), label: 'backup' }, entry('b'), entry('gone'), entry('c'), { id: 'broken' }],
      ['c'],
    )
    unsubscribe()

    expect(added).toBe(1)
    expect(getAddressBook()).toEqual([{ ...entry('a'), label: 'local' }, entry('b')])
    expect(getDeletedAddressIds().sort()).toEqual(['c', 'gone'])
    // Writing back what a backup holds must not trigger another backup
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('Nostr relay config', () => {
  it('parses a comma-separated list and drops anything that is not a websocket URL', () => {
    expect(parseNostrRelays(' wss://a.example , ws://localhost:10547,https://nope,, ')).toEqual([
      'wss://a.example',
      'ws://localhost:10547',
    ])
    expect(parseNostrRelays(undefined)).toEqual([])
  })

  it('blocks startup without a usable relay', () => {
    vi.stubEnv('VITE_NOSTR_RELAYS', 'https://not-a-relay')
    expect(getMissingRequiredConfig()).toContain('VITE_NOSTR_RELAYS')
    vi.unstubAllEnvs()
    expect(getMissingRequiredConfig()).not.toContain('VITE_NOSTR_RELAYS')
  })
})

describe('NostrStorage.save', () => {
  const storageWith = (publishes: Promise<string>[]) => {
    const storage = new NostrStorage({ seckey: generateSecretKey(), relays: ['wss://a', 'wss://b'] })
    ;(storage as any).pool = { publish: () => publishes }
    return storage
  }

  it('succeeds once any relay accepts the event', async () => {
    await expect(storageWith([Promise.reject(new Error('down')), Promise.resolve('ok')]).save('{}')).resolves.toBe(
      undefined,
    )
  })

  it('fails when no relay accepts the event', async () => {
    const failing = [Promise.reject(new Error('down')), Promise.reject(new Error('down'))]
    await expect(storageWith(failing).save('{}')).rejects.toThrow('No Nostr relay accepted the backup')
  })
})
