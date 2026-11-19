import { describe, expect, it } from 'vitest'
import { getSourceChains, requireAssetChainOption } from '../../lib/sourceChains'

const chainIds = (symbol: string, direction: 'wrap' | 'unwrap') =>
  getSourceChains(symbol, direction).map((option) => option.chain.id)

describe('Arkade Wrap source chains', () => {
  it('offers native assets in both directions on their own chains', () => {
    expect(chainIds('ETH', 'wrap')).toEqual(['ethereum'])
    expect(chainIds('ETH', 'unwrap')).toEqual(['ethereum'])
    expect(chainIds('TRX', 'wrap')).toEqual(['tron'])
    expect(chainIds('TRX', 'unwrap')).toEqual(['tron'])
    expect(chainIds('POL', 'wrap')).toEqual(['polygon'])
    expect(chainIds('POL', 'unwrap')).toEqual(['polygon'])
  })

  it('receives USDT from Ethereum, Tron, and Polygon', () => {
    expect(chainIds('USDT', 'wrap')).toEqual(['ethereum', 'tron', 'polygon'])
  })

  it('sends USDT only to Ethereum', () => {
    expect(chainIds('USDT', 'unwrap')).toEqual(['ethereum'])
    expect(() => requireAssetChainOption('USDT', 'tron', 'unwrap')).toThrow('No unwrap option')
    expect(() => requireAssetChainOption('USDT', 'polygon', 'unwrap')).toThrow('No unwrap option')
  })
})
