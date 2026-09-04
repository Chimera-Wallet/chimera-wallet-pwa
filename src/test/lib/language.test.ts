import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  isSupportedLanguage,
  readLanguageFromStorage,
  saveLanguageToStorage,
} from '../../lib/language'

describe('language persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('round-trips a supported language', () => {
    saveLanguageToStorage('fr')
    expect(readLanguageFromStorage()).toBe('fr')
  })

  it('returns undefined when nothing was stored', () => {
    expect(readLanguageFromStorage()).toBeUndefined()
  })

  it('rejects a stored value that is not a supported language', () => {
    // e.g. a code left behind by an older build, or hand-edited storage
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'klingon')
    expect(readLanguageFromStorage()).toBeUndefined()
  })

  it('survives storage being unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    expect(() => saveLanguageToStorage('it')).not.toThrow()
    expect(readLanguageFromStorage()).toBeUndefined()
  })

  it('recognises every language offered in settings and nothing else', () => {
    for (const lang of ['en', 'es', 'it', 'fr', 'jp', 'ch', 'rs']) {
      expect(isSupportedLanguage(lang)).toBe(true)
    }
    expect(isSupportedLanguage('de')).toBe(false)
    expect(isSupportedLanguage(undefined)).toBe(false)
    expect(isSupportedLanguage(null)).toBe(false)
  })

  it('defaults to English', () => {
    expect(DEFAULT_LANGUAGE).toBe('en')
  })
})
