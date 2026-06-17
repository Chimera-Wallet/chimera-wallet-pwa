import { ReactNode, createContext, useContext } from 'react'
import { Vtxo } from '../lib/types'
import { AspContext } from './asp'

interface FeesContextProps {
  calcOffchainInputFee: (vtxo: Vtxo) => number
  calcOffchainOutputFee: (vtxo: Vtxo) => number
  calcOnchainInputFee: (vtxo: Vtxo) => number
  calcOnchainOutputFee: () => number
}

export const FeesContext = createContext<FeesContextProps>({
  calcOffchainInputFee: () => 0,
  calcOffchainOutputFee: () => 0,
  calcOnchainOutputFee: () => 0,
  calcOnchainInputFee: () => 0,
})

// Fee fields on the ASP info are optional strings and, when the server doesn't
// provide them, default to '' (see emptyFees). `'' ?? '0'` keeps the empty
// string, and parseInt('') is NaN — which silently poisons every amount
// computed from a fee (e.g. `satoshis - fee` becomes NaN, blocking onchain
// sends). Coerce anything non-numeric to 0.
const parseFee = (value?: string): number => {
  const fee = parseInt(value ?? '', 10)
  return Number.isFinite(fee) ? fee : 0
}

export const FeesProvider = ({ children }: { children: ReactNode }) => {
  const { aspInfo } = useContext(AspContext)

  /**
   * Calculates the offchain input fee for a given vtxo.
   * @returns
   */
  const calcOffchainInputFee = (): number => {
    return parseFee(aspInfo.fees?.intentFee?.offchainInput)
  }

  /**
   * Calculates the offchain output fee for a given vtxo.
   * @returns
   */
  const calcOffchainOutputFee = (): number => {
    return parseFee(aspInfo.fees?.intentFee?.offchainOutput)
  }

  /**
   * Calculates the onchain input fee for a given vtxo.
   * @returns
   */
  const calcOnchainInputFee = (): number => {
    return parseFee(aspInfo.fees?.intentFee?.onchainInput)
  }

  /**
   * Calculates the onchain output fee for a given vtxo.
   * @returns
   */
  const calcOnchainOutputFee = (): number => {
    return parseFee(aspInfo.fees?.intentFee?.onchainOutput)
  }

  return (
    <FeesContext.Provider
      value={{
        calcOffchainInputFee,
        calcOffchainOutputFee,
        calcOnchainInputFee,
        calcOnchainOutputFee,
      }}
    >
      {children}
    </FeesContext.Provider>
  )
}
