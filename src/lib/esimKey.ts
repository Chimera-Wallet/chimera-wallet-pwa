import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { schnorr, secp256k1 } from '@noble/curves/secp256k1.js'
import { hex } from '@scure/base'
import { deriveNostrKeyFromMnemonic } from './mnemonic'

/**
 * The key that ties eSIM orders to this wallet (ramp-system
 * services/wallet-proof.ts). Ramp binds every eSIM order to its public key,
 * and a wallet restored from the same recovery phrase (or nsec) derives the
 * same key and can list its eSIMs again, links included.
 *
 * Derived one-way from the wallet's signing key, never the signing key
 * itself: embedded apps may ask the wallet identity to sign arbitrary messages
 * (Lendasat's bridge does), so a proof made with that key could be forged by
 * one. This key exists only here, in memory, from unlock to lock; nothing
 * outside this module can sign with it, and it is never stored.
 */

const DERIVATION_LABEL = 'chimera-esim-key-v1'

export type EsimProofPurpose = 'esim-purchase' | 'esim-orders'

export interface EsimProof {
  wallet_pubkey: string
  timestamp: number
  signature: string
}

let secret: Uint8Array | null = null
let mainnet = false

/** HMAC-SHA256 of the wallet's signing key; a valid secp256k1 secret key. */
export const deriveEsimSecret = (walletSecret: Uint8Array): Uint8Array => {
  const key = hmac(sha256, walletSecret, new TextEncoder().encode(DERIVATION_LABEL))
  if (!secp256k1.utils.isValidSecretKey(key)) throw new Error('Could not derive the eSIM key')
  return key
}

/** Called when the wallet unlocks, with the same credentials it booted from. */
export const setEsimKey = (credentials: { mnemonic?: string; privateKey?: Uint8Array }, isMainnet: boolean): void => {
  const walletSecret = credentials.mnemonic
    ? deriveNostrKeyFromMnemonic(credentials.mnemonic, isMainnet) // the wallet's signing key (BIP86 m/86'/coin'/0'/0/0)
    : credentials.privateKey
  if (!walletSecret) throw new Error('No wallet secret to derive the eSIM key from')
  secret = deriveEsimSecret(walletSecret)
  mainnet = isMainnet
}

/** Called when the wallet locks or is reset. */
export const clearEsimKey = (): void => {
  secret?.fill(0)
  secret = null
}

export const hasEsimKey = (): boolean => secret !== null

export const getEsimPubkey = (): string => {
  if (!secret) throw new Error('Unlock the wallet first')
  return hex.encode(schnorr.getPublicKey(secret))
}

/**
 * sha256("chimera-esim:<network>:<purpose>:<pubkey>:<timestamp>"), exactly as
 * ramp-system rebuilds it. Network is "bitcoin" on mainnet, "test" elsewhere,
 * so a signature made against staging is refused by production.
 */
export const esimProofMessage = (
  network: 'bitcoin' | 'test',
  purpose: EsimProofPurpose,
  pubkey: string,
  timestamp: number,
) => sha256(new TextEncoder().encode(`chimera-esim:${network}:${purpose}:${pubkey}:${timestamp}`))

/** A fresh, single-use proof for one request. */
export const signEsimProof = (purpose: EsimProofPurpose): EsimProof => {
  if (!secret) throw new Error('Unlock the wallet first')
  const pubkey = getEsimPubkey()
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = schnorr.sign(esimProofMessage(mainnet ? 'bitcoin' : 'test', purpose, pubkey, timestamp), secret)
  return { wallet_pubkey: pubkey, timestamp, signature: hex.encode(signature) }
}
