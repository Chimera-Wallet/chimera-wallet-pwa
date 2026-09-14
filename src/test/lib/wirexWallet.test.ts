// Unit tests for the deterministic, network-free part of wirexWallet.ts:
// deriving the Wirex EVM signer's address from the wallet's existing
// mnemonic. deployWirexKernelAccount (the on-chain deployment) needs a real
// Wirex SDK/sandbox and is exercised via the live suite instead.
import { describe, expect, it, beforeEach } from 'vitest'
import { setMnemonic } from '../../lib/mnemonic'
import { getWirexEvmAddress } from '../../lib/wirexWallet'

const testMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const otherMnemonic = 'legal winner thank year wave sausage worth useful legal winner thank yellow'
const testPassword = 'testpassword'

describe('wirexWallet.ts', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('getWirexEvmAddress', () => {
    it('derives a well-formed, EIP-55 checksummed address', async () => {
      await setMnemonic(testMnemonic, testPassword)
      const address = await getWirexEvmAddress(testPassword)
      expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/)
      // Mixed case proves it went through checksum encoding rather than
      // being returned all-lowercase.
      expect(address).not.toBe(address.toLowerCase())
      expect(address).not.toBe(address.toUpperCase())
    })

    it('is deterministic for the same mnemonic and password', async () => {
      await setMnemonic(testMnemonic, testPassword)
      const first = await getWirexEvmAddress(testPassword)
      const second = await getWirexEvmAddress(testPassword)
      expect(first).toBe(second)
    })

    it('derives a different address for a different mnemonic', async () => {
      await setMnemonic(testMnemonic, testPassword)
      const address1 = await getWirexEvmAddress(testPassword)

      localStorage.clear()
      await setMnemonic(otherMnemonic, testPassword)
      const address2 = await getWirexEvmAddress(testPassword)

      expect(address1).not.toBe(address2)
    })

    it('throws when no mnemonic is stored', async () => {
      await expect(getWirexEvmAddress(testPassword)).rejects.toThrow('No encrypted mnemonic found')
    })

    it('throws on the wrong password', async () => {
      await setMnemonic(testMnemonic, testPassword)
      await expect(getWirexEvmAddress('wrong-password')).rejects.toThrow()
    })
  })
})
