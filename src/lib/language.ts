/**
 * The chosen UI language.
 *
 * Kept in its own module rather than in `storage.ts`: `i18n.ts` reads this
 * while building the i18next instance at import time, and `storage.ts` pulls in
 * the wallet/config type graph, which has no business loading that early.
 *
 * The stored value is validated on read — an unrecognised code would otherwise
 * leave i18next pointed at a language with no bundled resources.
 */

export const SUPPORTED_LANGUAGES = ['en', 'es', 'it', 'fr', 'jp', 'ch', 'rs'] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en'

export const LANGUAGE_STORAGE_KEY = 'language'

export const isSupportedLanguage = (value: unknown): value is SupportedLanguage =>
  typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)

export const readLanguageFromStorage = (): SupportedLanguage | undefined => {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    return isSupportedLanguage(stored) ? stored : undefined
  } catch {
    // Private mode / blocked storage — fall back to the default language
    return undefined
  }
}

export const saveLanguageToStorage = (language: SupportedLanguage): void => {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  } catch {
    // Failing to persist shouldn't stop the language changing for this session
  }
}
