import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import '../../lib/i18n'

vi.mock('../../lib/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/assets')>()),
  getWrappedAssetId: (symbol: string) => (symbol === 'USDT' ? 'usdt-asset-id' : undefined),
}))

import TransactionsList from '../../components/TransactionsList'
import { ConfigContext } from '../../providers/config'
import { WalletContext } from '../../providers/wallet'
import { AspContext } from '../../providers/asp'
import {
  mockAspContextValue,
  mockConfigContextValue,
  mockIssuanceTxInfo,
  mockTxInfo,
  mockWalletContextValue,
} from '../screens/mocks'
import { saveWrapDeposit } from '../../lib/wrapDeposits'

const assetId = mockIssuanceTxInfo.assets[0].assetId
const assetMetadataCache = new Map([
  [assetId, { metadata: { ticker: 'USDT-CX', name: 'Tether', decimals: 6 }, cachedAt: Date.now() }],
])

const renderList = (txs: object[]) =>
  render(
    <AspContext.Provider value={mockAspContextValue as any}>
      <ConfigContext.Provider
        value={{ ...mockConfigContextValue, config: { ...mockConfigContextValue.config, showBalance: true } } as any}
      >
        <WalletContext.Provider value={{ ...mockWalletContextValue, txs, assetMetadataCache } as any}>
          <TransactionsList />
        </WalletContext.Provider>
      </ConfigContext.Provider>
    </AspContext.Provider>,
  )

describe('TransactionsList', () => {
  afterEach(() => localStorage.clear())

  it('prints a sent asset amount with one minus sign, though the SDK signs it negative', () => {
    renderList([{ ...mockTxInfo, type: 'sent', assets: [{ assetId, amount: BigInt(-1_500_000) }] }])
    expect(screen.getByText('- 1.5 USDT-CX')).toBeInTheDocument()
    expect(screen.queryByText(/- -/)).not.toBeInTheDocument()
  })

  it('lists an in-flight bridge deposit as pending', () => {
    saveWrapDeposit({
      assetSymbol: 'USDT',
      createdAt: Date.now(),
      quote: {
        id: 'q1',
        type: 'wrap',
        chain: 'ethereum',
        ticker: 'USDT',
        sender: '0xsender',
        receiver: 'ark1receiver',
        treasury: '0xtreasury',
        status: 'deposited',
        amount: '2000000',
        fee_amount: null,
        payout_amount: null,
        deposit_tx_hash: '0xdep',
        mint_tx_hash: null,
        burn_tx_hash: null,
        payout_tx_hash: null,
        expiry: Date.now() + 60_000,
      },
    })
    renderList([])
    expect(screen.getAllByTestId('tx-row')).toHaveLength(1)
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })
})
