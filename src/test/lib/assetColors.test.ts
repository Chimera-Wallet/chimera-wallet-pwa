import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { ASSETS } from '../../lib/assets'

// An undefined CSS variable fails silently: the asset charts drew black until
// these tokens existed. Every asset's `color` must name a real token.
describe('asset colours', () => {
  const tokens = readFileSync(resolve(__dirname, '../../tokens.css'), 'utf8')

  it.each(Object.values(ASSETS).map((asset) => [asset.symbol, asset.color]))(
    '%s colour --%s is defined in tokens.css',
    (_symbol, color) => {
      expect(tokens).toMatch(new RegExp(`--${color}:`))
    },
  )
})
