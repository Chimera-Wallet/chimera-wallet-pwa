import { useEffect, useState } from 'react'
import { getBankTransferConfig, getBankTransferConfigSync, type BankTransferConfig } from '../lib/bankTransferConfig'

/**
 * The bank transfer configuration, starting from what's cached and updated
 * once the provider's limits have loaded (ramp's, when it's the provider).
 */
export function useBankTransferConfig(): BankTransferConfig {
  const [config, setConfig] = useState<BankTransferConfig>(getBankTransferConfigSync)

  useEffect(() => {
    let cancelled = false
    getBankTransferConfig().then((loaded) => {
      if (!cancelled) setConfig(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return config
}
