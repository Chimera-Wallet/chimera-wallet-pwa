import { describe, expect, it } from 'vitest'
import { createRequestGeneration } from '../../lib/requestGeneration'

describe('createRequestGeneration', () => {
  it('marks earlier requests stale when a newer request begins', () => {
    const requests = createRequestGeneration()
    const first = requests.begin()
    const second = requests.begin()

    expect(requests.isCurrent(first)).toBe(false)
    expect(requests.isCurrent(second)).toBe(true)
  })
})
