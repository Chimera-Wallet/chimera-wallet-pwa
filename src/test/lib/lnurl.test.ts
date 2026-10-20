import fixtures from '../fixtures.json'
import createFetchMock from 'vitest-fetch-mock'
import { describe, expect, it, vi } from 'vitest'
import { checkLnUrlConditions, getCallbackUrl, isValidLnUrl, validateLnUrlInvoice } from '../../lib/lnurl'
import { sha256 } from '@noble/hashes/sha2.js'
import { hex, utf8 } from '@scure/base'

const fetchMocker = createFetchMock(vi)

fetchMocker.enableMocks()

const mockLNURLResponse = {
  callback: 'https://pay.staging.galoy.io/.well-known/lnurlp/testing',
  minSendable: 1000,
  maxSendable: 100000000000,
  metadata: 'mock-metadata',
}

describe('lnurl utilities', () => {
  it('should decode lnurl values', async () => {
    for (const test of fixtures.lib.lnurl) {
      expect(test).toHaveProperty('lnUrlOrAddress')
      expect(isValidLnUrl(test.lnUrlOrAddress)).toBe(true)
      expect(getCallbackUrl(test.lnUrlOrAddress)).toBe(test.callback)
    }
  })

  it('should fetch lnurl conditions', async () => {
    for (const test of fixtures.lib.lnurl) {
      const localMockResponse = { ...mockLNURLResponse, callback: test.callback }
      fetchMocker.mockResponseOnce(JSON.stringify(localMockResponse))
      expect(await checkLnUrlConditions(test.lnUrlOrAddress)).toEqual(localMockResponse)
    }
  })

  it('accepts an invoice bound to the LNURL metadata and requested payment', () => {
    const metadata = 'mock-metadata'
    expect(() =>
      validateLnUrlInvoice(
        {
          amountMsats: 21_000,
          amountSats: 21,
          descriptionHash: hex.encode(sha256(utf8.decode(metadata))),
          expiry: 3_600,
          expiresAt: Math.floor(Date.now() / 1000) + 3_600,
          network: 'bcrt',
          note: '',
          paymentHash: 'a'.repeat(64),
          timestamp: Math.floor(Date.now() / 1000),
        },
        21_000,
        metadata,
        'regtest',
      ),
    ).not.toThrow()
  })

  it('rejects a callback invoice for a different amount', () => {
    const metadata = 'mock-metadata'
    expect(() =>
      validateLnUrlInvoice(
        {
          amountMsats: 22_000,
          amountSats: 22,
          descriptionHash: hex.encode(sha256(utf8.decode(metadata))),
          expiry: 3_600,
          expiresAt: Math.floor(Date.now() / 1000) + 3_600,
          network: 'bcrt',
          note: '',
          paymentHash: 'a'.repeat(64),
          timestamp: Math.floor(Date.now() / 1000),
        },
        21_000,
        metadata,
        'regtest',
      ),
    ).toThrow('different amount')
  })
})
