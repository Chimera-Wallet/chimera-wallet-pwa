import { describe, expect, it } from 'vitest'
import { calculateCollaborativeExitOutput } from '../../lib/collaborativeExit'

describe('calculateCollaborativeExitOutput', () => {
  it('deducts the on-chain output fee from the settlement output', () => {
    expect(calculateCollaborativeExitOutput(100_000, 500)).toBe(99_500)
  })

  it('rejects an exit with no positive output after fees', () => {
    expect(() => calculateCollaborativeExitOutput(500, 500)).toThrow('On-chain output amount must be positive')
    expect(() => calculateCollaborativeExitOutput(499, 500)).toThrow('On-chain output amount must be positive')
  })
})
