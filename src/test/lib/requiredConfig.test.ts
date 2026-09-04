import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMissingRequiredConfig } from '../../lib/requiredConfig'

// vitest.config.ts provides a valid baseline; each test perturbs one value.
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getMissingRequiredConfig', () => {
  it('reports nothing for the baseline test configuration', () => {
    expect(getMissingRequiredConfig()).toEqual([])
  })

  it('reports VITE_ENABLED_ASSETS when it is unset', () => {
    vi.stubEnv('VITE_ENABLED_ASSETS', undefined as unknown as string)
    expect(getMissingRequiredConfig()).toContain('VITE_ENABLED_ASSETS')
  })

  it('reports VITE_ENABLED_ASSETS when it is empty or whitespace', () => {
    vi.stubEnv('VITE_ENABLED_ASSETS', '')
    expect(getMissingRequiredConfig()).toContain('VITE_ENABLED_ASSETS')

    vi.stubEnv('VITE_ENABLED_ASSETS', '   ')
    expect(getMissingRequiredConfig()).toContain('VITE_ENABLED_ASSETS')
  })

  it('still reports the other required vars', () => {
    vi.stubEnv('VITE_ARK_SERVER', '')
    expect(getMissingRequiredConfig()).toContain('VITE_ARK_SERVER')
  })

  it('requires delegation to be explicitly set', () => {
    vi.stubEnv('VITE_DELEGATE_ENABLED', 'yes')
    expect(getMissingRequiredConfig()).toContain('VITE_DELEGATE_ENABLED')
  })
})
