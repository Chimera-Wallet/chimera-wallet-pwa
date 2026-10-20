import { afterEach, describe, expect, it, vi } from 'vitest'
import { getTxNote, setTxNote, subscribeTxNotes, txNoteKey } from '../../lib/txNotes'
import type { Tx } from '../../lib/types'

const tx = (overrides: Partial<Tx> = {}): Tx => ({
  amount: 1_000,
  boardingTxid: '',
  createdAt: 0,
  explorable: undefined,
  preconfirmed: false,
  redeemTxid: 'abc',
  roundTxid: '',
  settled: true,
  type: 'received',
  ...overrides,
})

describe('transaction notes', () => {
  afterEach(() => localStorage.clear())

  it('keys a transaction by direction and id, preferring the boarding id', () => {
    expect(txNoteKey(tx())).toBe('received:abc')
    expect(txNoteKey(tx({ type: 'sent' }))).toBe('sent:abc')
    expect(txNoteKey(tx({ boardingTxid: 'board', redeemTxid: 'abc' }))).toBe('received:board')
    expect(txNoteKey(tx({ redeemTxid: '', roundTxid: 'round' }))).toBe('received:round')
  })

  it('has no key for a transaction without an id', () => {
    expect(txNoteKey(tx({ redeemTxid: '' }))).toBeUndefined()
    expect(getTxNote(undefined)).toBe('')
  })

  it('saves a trimmed note, and removes it when emptied', () => {
    setTxNote('received:abc', '  Invoice 42  ')
    expect(getTxNote('received:abc')).toBe('Invoice 42')
    expect(getTxNote('sent:abc')).toBe('')

    setTxNote('received:abc', '   ')
    expect(getTxNote('received:abc')).toBe('')
    expect(JSON.parse(localStorage.getItem('tx_notes')!)).toEqual({})
  })

  it('notifies subscribers of a change', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeTxNotes(listener)
    setTxNote('received:abc', 'Rent')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    setTxNote('received:abc', 'Rent, October')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('ignores a corrupt stored value', () => {
    localStorage.setItem('tx_notes', 'not json')
    expect(getTxNote('received:abc')).toBe('')
    setTxNote('received:abc', 'Fixed')
    expect(getTxNote('received:abc')).toBe('Fixed')
  })
})
