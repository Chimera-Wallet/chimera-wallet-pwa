/**
 * Shared on-screen keypad input rules, used by the generic amount Keyboard and
 * the POS terminal keypad.
 *
 * Keys are '0'-'9', '.' (decimal point) and 'x' (backspace).
 */

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'x'

/** Phone-style key layout, top row first. */
export const KEYPAD_ROWS: KeypadKey[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'x'],
]

/**
 * Apply a key press to the current text value and return the new value.
 * Returns the input unchanged when the key is not allowed (a second decimal
 * point, a decimal point for an integer unit, or too many decimal places).
 */
export const applyKeypadKey = (text: string, key: string, maxDecimals: number): string => {
  if (key === '.') {
    if (maxDecimals === 0) return text // no decimals for integer units (e.g. sats)
    if (text.includes('.')) return text // already has a decimal point
    return text === '' ? '0.' : text + '.'
  }

  if (key === 'x') return text.slice(0, -1)

  if (!/^[0-9]$/.test(key)) return text

  // avoid leading zeros like "007" — "0." is still reachable via the '.' key
  const next = text === '0' ? key : text + key
  const parts = next.split('.')
  if (parts.length > 1 && parts[1].length > maxDecimals) return text // exceeded max decimals

  return next
}
