import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { I18nextProvider, Trans, initReactI18next } from 'react-i18next'
import { createInstance, type i18n as I18n } from 'i18next'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Strings that interpolate a clickable element must not wrap it in a void HTML
 * tag. Trans parses the string as HTML, and a void element cannot hold
 * children — so `<link>text</link>` either prints the tag as literal text or
 * renders an empty anchor with the label stranded outside it. Both looked like
 * markup leaking into the UI.
 */

// Void elements per the HTML spec — none of these can wrap a label.
const VOID_TAGS = [
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]

const LOCALES_DIR = path.resolve(__dirname, '../../lib/locales')
const langs = fs.readdirSync(LOCALES_DIR).filter((d) => fs.statSync(path.join(LOCALES_DIR, d)).isDirectory())

const collectStrings = (value: unknown, keyPath: string, out: [string, string][]) => {
  if (typeof value === 'string') out.push([keyPath, value])
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) collectStrings(v, keyPath ? `${keyPath}.${k}` : k, out)
  }
}

describe('locale strings with interpolated elements', () => {
  it.each(langs)('%s uses no void HTML tag as a wrapper', (lang) => {
    const offenders: string[] = []
    for (const file of fs.readdirSync(path.join(LOCALES_DIR, lang))) {
      if (!file.endsWith('.json')) continue
      const json = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, lang, file), 'utf8'))
      const strings: [string, string][] = []
      collectStrings(json, '', strings)
      for (const [key, str] of strings) {
        for (const tag of VOID_TAGS) {
          if (str.includes(`</${tag}>`)) offenders.push(`${file}:${key} closes <${tag}>`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('Trans renders the send-screen nudges as real links', () => {
  const makeI18n = async (): Promise<I18n> => {
    const common = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en/common.json'), 'utf8'))
    const inst = createInstance()
    await inst.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      resources: { en: { translation: { common } } },
    })
    return inst
  }

  it.each([
    ['common.notifications.send.rollOverVTXO', 'roll over your VTXOs'],
    ['common.notifications.send.lightningSwaps', 'Lightning swaps'],
  ])('%s wraps its label in the supplied anchor', async (key, label) => {
    const i18n = await makeI18n()
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <Trans i18nKey={key} components={{ a: <a /> }} />
      </I18nextProvider>,
    )

    // The label is inside the anchor, and no raw tag leaked into the text.
    const anchor = container.querySelector('a')
    expect(anchor?.textContent).toBe(label)
    expect(container.textContent).not.toMatch(/[<>]/)
  })
})
