import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { useContext } from 'react'
import { AspContext } from '../../providers/asp'
import { LimitsContext, LimitsProvider, getAspLimit } from '../../providers/limits'
import { SwapsContext } from '../../providers/swaps'
import { WalletContext } from '../../providers/wallet'
import { mockAspContextValue, mockSvcWallet, mockSwapsContextValue, mockWalletContextValue } from '../screens/mocks'

const LimitsProbe = () => {
  const { utxoTxsAllowed, validUtxoTx, vtxoTxsAllowed } = useContext(LimitsContext)
  return <div>{`${utxoTxsAllowed()}:${validUtxoTx(1)}:${vtxoTxsAllowed()}`}</div>
}

describe('ASP transaction limits', () => {
  it('preserves a zero max limit', () => {
    expect(getAspLimit(undefined, BigInt(0), BigInt(-1))).toBe(0)
  })

  it('uses the fallback only when the server limit is absent', () => {
    expect(getAspLimit(undefined, undefined, BigInt(-1))).toBe(-1)
  })

  it('applies ASP limits while swaps are disconnected', async () => {
    render(
      <AspContext.Provider
        value={{
          ...mockAspContextValue,
          aspInfo: { ...mockAspContextValue.aspInfo, utxoMaxAmount: BigInt(0), vtxoMaxAmount: BigInt(0) },
        }}
      >
        <WalletContext.Provider value={{ ...mockWalletContextValue, svcWallet: mockSvcWallet } as any}>
          <SwapsContext.Provider value={{ ...mockSwapsContextValue, connected: false, arkadeSwaps: null }}>
            <LimitsProvider>
              <LimitsProbe />
            </LimitsProvider>
          </SwapsContext.Provider>
        </WalletContext.Provider>
      </AspContext.Provider>,
    )

    await waitFor(() => expect(screen.getByText('false:false:false')).toBeInTheDocument())
  })
})
