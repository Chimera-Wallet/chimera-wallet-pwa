import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ASSETS, ASSET_LIST, parseEnabledAssets, type AssetSymbol } from '../../lib/assets'

const symbolsOf = (raw: string | undefined) => parseEnabledAssets(raw).assets.map((a) => a.symbol)

describe('parseEnabledAssets', () => {
  it('returns the listed assets', () => {
    expect(symbolsOf('BTC,CEXT')).toEqual(['BTC', 'CEXT'])
  })

  it('enables every known asset when all are listed', () => {
    expect(symbolsOf('BTC,USDT,ETH,TRX,POL,CEXT')).toEqual(Object.keys(ASSETS))
  })

  it('tolerates whitespace and lowercase', () => {
    expect(symbolsOf(' btc , cext ')).toEqual(['BTC', 'CEXT'])
  })

  it('ignores empty entries and trailing separators', () => {
    expect(symbolsOf('BTC,,CEXT,')).toEqual(['BTC', 'CEXT'])
  })

  it('orders by the ASSETS declaration, not by the env var', () => {
    // Rewriting the variable must not reshuffle the home list or the pickers.
    expect(symbolsOf('CEXT,BTC')).toEqual(symbolsOf('BTC,CEXT'))
  })

  it('de-duplicates repeated symbols', () => {
    expect(symbolsOf('BTC,BTC,CEXT')).toEqual(['BTC', 'CEXT'])
  })

  it('yields no assets when unset or empty, rather than a default set', () => {
    expect(symbolsOf(undefined)).toEqual([])
    expect(symbolsOf('')).toEqual([])
    expect(symbolsOf('   ')).toEqual([])
  })

  it('reports unknown symbols instead of silently dropping them', () => {
    const { assets, unknown } = parseEnabledAssets('BTC,DOGE,CEXT')
    expect(assets.map((a) => a.symbol)).toEqual(['BTC', 'CEXT'])
    expect(unknown).toEqual(['DOGE'])
  })

  it('resolves symbols to their real config, not a stub', () => {
    const [btc] = parseEnabledAssets('BTC').assets
    expect(btc).toBe(ASSETS.BTC)
  })
})

describe('ASSET_LIST from the environment', () => {
  it('reflects VITE_ENABLED_ASSETS for this build', () => {
    // vitest.config.ts sets BTC,CEXT — production's set.
    expect(ASSET_LIST.map((a) => a.symbol)).toEqual(['BTC', 'CEXT'])
  })
})

describe('deployed env files', () => {
  const read = (file: string) => fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8')
  const valueOf = (file: string) => read(file).match(/^VITE_ENABLED_ASSETS=(.*)$/m)?.[1]?.trim()

  it('staging offers every known asset', () => {
    expect(symbolsOf(valueOf('.env.staging'))).toEqual(Object.keys(ASSETS))
  })

  it('production offers only the launched assets', () => {
    expect(symbolsOf(valueOf('.env.production'))).toEqual(['BTC', 'CEXT'])
  })

  it('names no unknown symbol in either file', () => {
    expect(parseEnabledAssets(valueOf('.env.staging')).unknown).toEqual([])
    expect(parseEnabledAssets(valueOf('.env.production')).unknown).toEqual([])
  })

  it('sets a wrapped-asset id for every staging asset that needs one', () => {
    // Boot requires VITE_ARKADE_<SYMBOL> for each enabled, non-comingSoon
    // wrapped asset — so enabling one on staging without its id would block
    // the app there. BTC is native; CEXT is comingSoon.
    const staging = read('.env.staging')
    const needsId = parseEnabledAssets(valueOf('.env.staging')).assets.filter(
      (asset) => !asset.comingSoon && asset.symbol !== 'BTC',
    )
    expect(needsId.length).toBeGreaterThan(0)
    for (const asset of needsId) {
      const key = `VITE_ARKADE_${asset.symbol as AssetSymbol}`
      expect(staging, `${key} must be set for enabled asset ${asset.symbol}`).toMatch(
        new RegExp(`^${key}=\\S+`, 'm'),
      )
    }
  })

  it('leaves the example file blank so nothing works by accident', () => {
    expect(valueOf('.env.example')).toBe('')
  })
})
