/**
 * User notes on wallet transactions (e.g. a reference for a past payment).
 *
 * Stored locally, like POS sales and bank order history — not in Config,
 * which is backed up to Nostr. A POS sale keeps its own note on the sale
 * record (lib/pos), since a sale isn't linked to the transaction that paid it.
 *
 * Reads go through a cache keyed on the raw stored string, so unchanged notes
 * keep their identity between reads and screens can subscribe with
 * useSyncExternalStore.
 */

import type { Tx } from './types'

const NOTES_KEY = 'tx_notes'

/**
 * Stable key for a transaction's note: its direction plus the id that
 * identifies it (see Transaction.tsx::sameTx). Undefined for a transaction
 * with no id yet, which can't carry a note.
 */
export const txNoteKey = (tx: Tx): string | undefined => {
  const id = tx.boardingTxid || tx.redeemTxid || tx.roundTxid
  return id ? `${tx.type}:${id}` : undefined
}

type Listener = () => void
const listeners = new Set<Listener>()

export const subscribeTxNotes = (listener: Listener): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const parseNotes = (raw: string | null): Record<string, string> => {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

let cache: { raw: string | null; notes: Record<string, string> } = { raw: null, notes: {} }

const getTxNotes = (): Record<string, string> => {
  const raw = localStorage.getItem(NOTES_KEY)
  if (raw !== cache.raw) cache = { raw, notes: parseNotes(raw) }
  return cache.notes
}

export const getTxNote = (key: string | undefined): string => (key ? (getTxNotes()[key] ?? '') : '')

/** Save a transaction's note; an empty note removes it. */
export const setTxNote = (key: string, note: string): void => {
  const notes = { ...getTxNotes() }
  const trimmed = note.trim()
  if (trimmed) notes[key] = trimmed
  else delete notes[key]
  const raw = JSON.stringify(notes)
  localStorage.setItem(NOTES_KEY, raw)
  cache = { raw, notes }
  listeners.forEach((l) => l())
}
