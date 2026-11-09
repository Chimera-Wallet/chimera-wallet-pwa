import { describe, expect, it } from 'vitest'
import { applyKeypadKey } from '../../lib/keypad'

const type = (keys: string[], maxDecimals: number) => keys.reduce((text, k) => applyKeypadKey(text, k, maxDecimals), '')

describe('applyKeypadKey', () => {
  it('appends digits', () => {
    expect(type(['1', '2', '3'], 2)).toBe('123')
  })

  it('starts a decimal with a leading zero and allows only one point', () => {
    expect(type(['.', '5', '.', '0'], 2)).toBe('0.50')
  })

  it('caps decimal places at the unit precision', () => {
    expect(type(['1', '.', '2', '3', '4'], 2)).toBe('1.23')
  })

  it('ignores the decimal point for integer units', () => {
    expect(type(['1', '.', '5'], 0)).toBe('15')
  })

  it('replaces a lone leading zero instead of prefixing it', () => {
    expect(type(['0', '0', '7'], 0)).toBe('7')
    expect(type(['0', '.', '0', '7'], 2)).toBe('0.07')
  })

  it('backspaces and ignores unknown keys', () => {
    expect(type(['1', '2', 'x'], 2)).toBe('1')
    expect(type(['x'], 2)).toBe('')
    expect(applyKeypadKey('12', 'a', 2)).toBe('12')
  })
})
