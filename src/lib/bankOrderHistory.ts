/**
 * Bank Order History types and storage utilities
 */

import type { RampOrder } from '../providers/ramp'
import { type BankCircuit } from './bankTransferConfig'

// Bank Order Type
export type BankOrderType = 'receive' | 'send'

// Bank Order History Entry
export interface BankOrderHistoryEntry {
  order: RampOrder
  type: BankOrderType
  timestamp: number
  circuit?: BankCircuit
}

// Storage key for bank order history
const BANK_ORDER_HISTORY_STORAGE_KEY = 'bank_order_history'

/**
 * Get all bank order history entries from storage
 */
export function getBankOrderHistory(): BankOrderHistoryEntry[] {
  try {
    const stored = localStorage.getItem(BANK_ORDER_HISTORY_STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

/**
 * Save bank order history to storage
 */
export function saveBankOrderHistory(entries: BankOrderHistoryEntry[]): void {
  localStorage.setItem(BANK_ORDER_HISTORY_STORAGE_KEY, JSON.stringify(entries))
}

/**
 * Add a new order to history
 */
export function addOrderToHistory(order: RampOrder, type: BankOrderType, circuit?: BankCircuit): BankOrderHistoryEntry {
  const entries = getBankOrderHistory()
  const newEntry: BankOrderHistoryEntry = {
    order,
    type,
    timestamp: Date.now(),
    circuit,
  }
  // Add to beginning of array (most recent first)
  entries.unshift(newEntry)
  saveBankOrderHistory(entries)
  return newEntry
}

/**
 * Get order from history by ID
 */
export function getOrderById(orderId: string): BankOrderHistoryEntry | undefined {
  const entries = getBankOrderHistory()
  return entries.find((e) => e.order.id === orderId)
}

/**
 * Remove an order from history by ID
 */
export function removeOrderFromHistory(orderId: string): boolean {
  const entries = getBankOrderHistory()
  const filtered = entries.filter((e) => e.order.id !== orderId)
  if (filtered.length === entries.length) return false
  saveBankOrderHistory(filtered)
  return true
}

/**
 * Clear all order history
 */
export function clearOrderHistory(): void {
  saveBankOrderHistory([])
}

/**
 * Get orders by type
 */
export function getOrdersByType(type: BankOrderType): BankOrderHistoryEntry[] {
  const entries = getBankOrderHistory()
  return entries.filter((e) => e.type === type)
}

/**
 * Get orders by status
 */
export function getOrdersByStatus(status: string): BankOrderHistoryEntry[] {
  const entries = getBankOrderHistory()
  return entries.filter((e) => e.order.status === status)
}
