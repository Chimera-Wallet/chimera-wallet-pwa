/**
 * Address Book types and storage utilities
 */

// Address types supported by the address book
export enum AddressType {
  Ark = 'ark',
  Bitcoin = 'bitcoin',
}

// Address book entry interface
export interface AddressBookEntry {
  id: string
  type: AddressType
  address: string
  label?: string
  // null = own account, string = contact name
  contact: string | null
  createdAt: number
}

// Storage key for address book
const ADDRESS_BOOK_STORAGE_KEY = 'address_book'
// Ids of deleted entries. The Nostr backup merges every backup event, so a
// deletion needs a record of its own or a restore would bring the entry back.
const ADDRESS_BOOK_DELETED_STORAGE_KEY = 'address_book_deleted'

/**
 * Generate a unique ID for address book entries
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Get all address book entries from storage
 */
export function getAddressBook(): AddressBookEntry[] {
  try {
    const stored = localStorage.getItem(ADDRESS_BOOK_STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

/** Ids of entries deleted from this address book (see the storage key note). */
export function getDeletedAddressIds(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(ADDRESS_BOOK_DELETED_STORAGE_KEY) ?? '[]')
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function addDeletedAddressIds(ids: string[]): void {
  if (!ids.length) return
  const deleted = new Set(getDeletedAddressIds())
  for (const id of ids) deleted.add(id)
  localStorage.setItem(ADDRESS_BOOK_DELETED_STORAGE_KEY, JSON.stringify([...deleted]))
}

type AddressBookListener = (entries: AddressBookEntry[]) => void
const listeners = new Set<AddressBookListener>()

/**
 * Be told whenever the address book is saved (the Nostr backup subscribes, see
 * providers/backup.tsx). Not called for restoreAddressBook(), which writes what
 * a backup already holds. Returns an unsubscribe function.
 */
export function onAddressBookChange(listener: AddressBookListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Save address book to storage
 */
export function saveAddressBook(entries: AddressBookEntry[]): void {
  localStorage.setItem(ADDRESS_BOOK_STORAGE_KEY, JSON.stringify(entries))
  for (const listener of listeners) listener(entries)
}

/** Whether a value read from a backup is a well-formed address book entry. */
export function isAddressBookEntry(value: unknown): value is AddressBookEntry {
  const entry = value as AddressBookEntry | null
  return Boolean(
    entry &&
    typeof entry.id === 'string' &&
    (entry.type === AddressType.Ark || entry.type === AddressType.Bitcoin) &&
    typeof entry.address === 'string' &&
    entry.address.length > 0 &&
    (entry.label === undefined || typeof entry.label === 'string') &&
    (entry.contact === null || typeof entry.contact === 'string') &&
    typeof entry.createdAt === 'number',
  )
}

/**
 * Bring back entries from a backup. Entries already on this device win over a
 * backed-up entry with the same id, and nothing local is removed, so a restore
 * can only add. Entries deleted here or in the backup stay deleted, and the
 * backup's deletions are kept so later backups carry them on. Malformed entries
 * are skipped. Returns how many were added.
 */
export function restoreAddressBook(backedUp: unknown, deletedIds: unknown = []): number {
  if (Array.isArray(deletedIds)) addDeletedAddressIds(deletedIds.filter((id): id is string => typeof id === 'string'))
  if (!Array.isArray(backedUp)) return 0
  const local = getAddressBook()
  const known = new Set([...local.map((entry) => entry.id), ...getDeletedAddressIds()])
  const added: AddressBookEntry[] = []
  for (const entry of backedUp) {
    if (!isAddressBookEntry(entry) || known.has(entry.id)) continue
    known.add(entry.id)
    added.push(entry)
  }
  if (!added.length) return 0
  localStorage.setItem(ADDRESS_BOOK_STORAGE_KEY, JSON.stringify([...local, ...added]))
  return added.length
}

/**
 * Add a new address to the address book
 */
export function addAddress(entry: Omit<AddressBookEntry, 'id' | 'createdAt'>): AddressBookEntry {
  const entries = getAddressBook()
  const newEntry: AddressBookEntry = {
    ...entry,
    id: generateId(),
    createdAt: Date.now(),
  }
  entries.push(newEntry)
  saveAddressBook(entries)
  return newEntry
}

/**
 * Update an existing address
 */
export function updateAddress(id: string, updates: Partial<Omit<AddressBookEntry, 'id' | 'createdAt'>>): boolean {
  const entries = getAddressBook()
  const index = entries.findIndex((e) => e.id === id)
  if (index === -1) return false
  entries[index] = { ...entries[index], ...updates }
  saveAddressBook(entries)
  return true
}

/**
 * Remove an address by ID
 */
export function removeAddress(id: string): boolean {
  const entries = getAddressBook()
  const filtered = entries.filter((e) => e.id !== id)
  if (filtered.length === entries.length) return false
  addDeletedAddressIds([id])
  saveAddressBook(filtered)
  return true
}

/**
 * Remove all addresses for a contact
 */
export function removeContact(contactName: string): void {
  const entries = getAddressBook()
  const filtered = entries.filter((e) => e.contact !== contactName)
  addDeletedAddressIds(entries.filter((e) => e.contact === contactName).map((e) => e.id))
  saveAddressBook(filtered)
}

/**
 * Get all unique contact names
 */
export function getContacts(): string[] {
  const entries = getAddressBook()
  const contacts = new Set<string>()
  for (const entry of entries) {
    if (entry.contact !== null) {
      contacts.add(entry.contact)
    }
  }
  return Array.from(contacts)
}

/**
 * Get all addresses for a specific contact
 */
export function getContactAddresses(contactName: string): AddressBookEntry[] {
  return getAddressBook().filter((e) => e.contact === contactName)
}

/**
 * Get all "my accounts" (entries without a contact name)
 */
export function getMyAccounts(): AddressBookEntry[] {
  return getAddressBook().filter((e) => e.contact === null)
}

/**
 * Get display name for address type
 */
export function getAddressTypeName(type: AddressType): string {
  switch (type) {
    case AddressType.Ark:
      return 'Arkade Address'
    case AddressType.Bitcoin:
      return 'Bitcoin Address'
    default:
      return 'Address'
  }
}

/**
 * Validate address format based on type
 */
export function isValidAddress(address: string, type: AddressType): boolean {
  if (!address || address.trim().length === 0) return false

  switch (type) {
    case AddressType.Ark:
      // Ark addresses typically start with 'ark1' or 'tark1' for testnet
      return address.toLowerCase().startsWith('ark1') || address.toLowerCase().startsWith('tark1')
    case AddressType.Bitcoin:
      // Basic Bitcoin address validation (mainnet and testnet)
      const btcRegex = /^(bc1|tb1|[13]|[mn2])[a-zA-HJ-NP-Z0-9]{25,90}$/
      return btcRegex.test(address)
    default:
      return address.length > 0
  }
}
