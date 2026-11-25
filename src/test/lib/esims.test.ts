import { beforeEach, describe, expect, it, vi } from 'vitest'
import { schnorr } from '@noble/curves/secp256k1.js'
import { hex } from '@scure/base'
import { generateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { clearEsimKey, esimProofMessage, getEsimPubkey, setEsimKey, signEsimProof } from '../../lib/esimKey'
import { deriveNostrKeyFromMnemonic } from '../../lib/mnemonic'
import {
  esimState,
  getStoredEsims,
  mergeEsim,
  openEsimLink,
  payEsimOrder,
  restoreEsims,
  syncEsims,
  toBaseUnits,
  type StoredEsim,
} from '../../lib/esims'
import { mergeBackupEvents } from '../../lib/backup'
import type { BackupEvent } from '../../lib/nostr'
import type { Tx } from '../../lib/types'
import { listEsimOrders, reportRampDeposit } from '../../providers/ramp'
import { sendOffChain } from '../../lib/asp'

vi.mock('../../providers/ramp', () => ({
  purchaseEsim: vi.fn(),
  getEsimOrder: vi.fn(),
  listEsimOrders: vi.fn(),
  reportRampDeposit: vi.fn(),
}))

vi.mock('../../lib/asp', () => ({
  sendOffChain: vi.fn(),
  sendAssets: vi.fn(),
}))

const NOW = Date.now()

const esim = (overrides: Partial<StoredEsim> = {}): StoredEsim => ({
  token: 'abcdefgh',
  code: 'ORD-AAAA-BBBB',
  accessKey: 'k'.repeat(43),
  asset: 'ARK-BTC',
  cryptoAmount: '0.00016200',
  depositAddress: 'tark1deposit',
  status: 'WAITING_FOR_DEPOSIT',
  plan: 'DATA.PLUS',
  link: null,
  linkUnavailable: false,
  paying: false,
  txid: null,
  reported: false,
  paidTooLate: false,
  createdAt: NOW - 60_000,
  expiresAt: NOW + 14 * 60_000,
  ...overrides,
})

const save = (...esims: StoredEsim[]) => localStorage.setItem('esim_orders', JSON.stringify(esims))
const stored = (token = 'abcdefgh') => getStoredEsims().find((e) => e.token === token)

beforeEach(() => {
  localStorage.clear()
  vi.mocked(reportRampDeposit).mockReset()
  vi.mocked(sendOffChain).mockReset()
  vi.mocked(listEsimOrders).mockReset()
})

describe('eSIM key', () => {
  it('signs proofs ramp can check, with the same key whichever way the wallet was opened', () => {
    const mnemonic = generateMnemonic(wordlist)
    setEsimKey({ mnemonic }, false)
    const fromMnemonic = getEsimPubkey()
    setEsimKey({ privateKey: deriveNostrKeyFromMnemonic(mnemonic, false) }, false)
    expect(getEsimPubkey()).toBe(fromMnemonic)

    const proof = signEsimProof('esim-orders')
    const message = esimProofMessage('test', 'esim-orders', proof.wallet_pubkey, proof.timestamp)
    expect(schnorr.verify(hex.decode(proof.signature), message, hex.decode(proof.wallet_pubkey))).toBe(true)
    // Not valid for another purpose or network
    expect(
      schnorr.verify(
        hex.decode(proof.signature),
        esimProofMessage('bitcoin', 'esim-orders', proof.wallet_pubkey, proof.timestamp),
        hex.decode(proof.wallet_pubkey),
      ),
    ).toBe(false)
  })

  it("isn't the wallet's signing key, and is gone once the wallet locks", () => {
    const privateKey = schnorr.utils.randomSecretKey()
    setEsimKey({ privateKey }, true)
    expect(getEsimPubkey()).not.toBe(hex.encode(schnorr.getPublicKey(privateKey)))
    clearEsimKey()
    expect(() => signEsimProof('esim-purchase')).toThrow(/Unlock/)
  })
})

describe('eSIM orders', () => {
  it('converts amounts exactly', () => {
    expect(toBaseUnits('0.00016200', 8)).toBe(BigInt(16200))
    expect(toBaseUnits('17.4', 6)).toBe(BigInt(17_400_000))
    expect(toBaseUnits('0.000000001', 8)).toBeUndefined()
    expect(toBaseUnits('1e5', 8)).toBeUndefined()
  })

  it('never loses a link, txid or key when two copies are combined', () => {
    const paid = esim({ txid: 'tx1', reported: true, status: 'DEPOSIT_RECEIVED' })
    const delivered = esim({
      accessKey: null,
      status: 'COMPLETED',
      link: 'https://esim.test/1',
      imsi: '001010000000001',
    })
    const merged = mergeEsim(paid, delivered)
    expect(merged).toMatchObject({
      txid: 'tx1',
      accessKey: 'k'.repeat(43),
      status: 'COMPLETED',
      link: 'https://esim.test/1',
      imsi: '001010000000001',
    })
    expect(mergeEsim(delivered, esim())).toMatchObject({ status: 'COMPLETED', link: 'https://esim.test/1' })
  })

  it('combines eSIM orders across backup events, one per order', () => {
    const event = (content: object, at: number) =>
      ({ id: `e${at}`, content: JSON.stringify(content), created_at: at, receivedAt: 10_000 }) as BackupEvent
    const merged = mergeBackupEvents([
      event({ esims: [esim({ txid: 'tx1' }), esim({ token: 'otherone' })] }, 1),
      event({ esims: [esim({ status: 'COMPLETED', link: 'https://esim.test/1' })] }, 2),
      event({ esims: [{ token: 'broken' }] }, 3),
    ])
    expect(merged.esims?.map((e) => e.token).sort()).toEqual(['abcdefgh', 'otherone'])
    expect(merged.esims?.find((e) => e.token === 'abcdefgh')).toMatchObject({
      txid: 'tx1',
      link: 'https://esim.test/1',
    })

    expect(restoreEsims(merged.esims ?? [])).toBe(2)
    expect(stored()?.link).toBe('https://esim.test/1')
  })

  it('pays once, keeps the txid before reporting, and reports later if that fails', async () => {
    save(esim())
    vi.mocked(sendOffChain).mockResolvedValue('tx-paid')
    vi.mocked(reportRampDeposit).mockRejectedValueOnce(new Error('offline'))
    const wallet = {} as never

    await expect(payEsimOrder(wallet, 'abcdefgh')).rejects.toThrow('offline')
    expect(sendOffChain).toHaveBeenCalledWith(wallet, 16200, 'tark1deposit')
    expect(stored()).toMatchObject({ txid: 'tx-paid', paying: true, reported: false })
    expect(esimState(stored()!)).toBe('confirming')

    // Never a second payment for the same order
    await expect(payEsimOrder(wallet, 'abcdefgh')).rejects.toThrow(/already being paid/)
    expect(sendOffChain).toHaveBeenCalledTimes(1)

    vi.mocked(reportRampDeposit).mockResolvedValueOnce({ status: 'DEPOSIT_RECEIVED' } as never)
    await syncEsims({ listFromServer: false })
    expect(reportRampDeposit).toHaveBeenLastCalledWith('abcdefgh', 'tx-paid')
    expect(stored()?.reported).toBe(true)
  })

  it('tells the user to ask for a refund when ramp says the payment was late', async () => {
    save(esim({ txid: 'tx-late', paying: true }))
    vi.mocked(reportRampDeposit).mockRejectedValueOnce(new Error('Order ORD-AAAA-BBBB has expired'))
    await syncEsims({ listFromServer: false })
    expect(stored()?.paidTooLate).toBe(true)
    expect(esimState(stored()!)).toBe('needsSupport')
  })

  it('refuses an expired order', async () => {
    save(esim({ expiresAt: NOW - 1000 }))
    await expect(payEsimOrder({} as never, 'abcdefgh')).rejects.toThrow(/expired/)
    expect(sendOffChain).not.toHaveBeenCalled()
  })

  it("on a restored wallet, lists the orders from ramp and reports a payment found in the wallet's history", async () => {
    setEsimKey({ privateKey: schnorr.utils.randomSecretKey() }, false)
    const created = new Date(NOW - 120_000).toISOString()
    vi.mocked(listEsimOrders).mockResolvedValue({
      orders: [
        {
          order: {
            id: 'restored',
            code: 'ORD-CCCC-DDDD',
            status: 'WAITING_FOR_DEPOSIT',
            asset: 'ARK-BTC',
            crypto_amount: '0.00016199',
            fiat_amount: '15',
            fiat_currency: 'EUR',
            deposit_crypto_address: 'tark1deposit',
            deposit_txid: null,
            created_at: created,
            expires_at: new Date(NOW - 120_000 + 15 * 60_000).toISOString(),
            completed_at: null,
          },
          plan: 'DATA.PLUS',
          link: null,
        },
      ],
    })
    vi.mocked(reportRampDeposit).mockResolvedValue({ status: 'DEPOSIT_RECEIVED' } as never)
    const tx = (amount: number, at: number, redeemTxid: string): Tx =>
      ({ type: 'sent', amount, createdAt: Math.floor(at / 1000), redeemTxid, boardingTxid: '', roundTxid: '' }) as Tx

    await syncEsims({
      listFromServer: true,
      txs: [
        tx(16200, NOW - 100_000, 'other-amount'),
        tx(16199, NOW - 400_000, 'too-early'),
        tx(16199, NOW - 100_000, 'the-payment'),
      ],
    })
    expect(reportRampDeposit).toHaveBeenCalledWith('restored', 'the-payment')
    expect(stored('restored')).toMatchObject({
      code: 'ORD-CCCC-DDDD',
      txid: 'the-payment',
      reported: true,
      accessKey: null,
    })
  })

  it('only opens web links', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    expect(openEsimLink('javascript:alert(1)')).toBe(false)
    expect(openEsimLink('data:text/html,hi')).toBe(false)
    expect(openEsimLink('not a url')).toBe(false)
    expect(openEsimLink('https://silent.link/order/abc')).toBe(true)
    expect(open).toHaveBeenCalledWith('https://silent.link/order/abc', '_blank', 'noopener,noreferrer')
    open.mockRestore()
  })
})
