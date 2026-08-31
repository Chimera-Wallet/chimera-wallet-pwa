// Wallet lock helpers.
//
// A wallet's secret (mnemonic, or a raw private key on legacy wallets) is
// stored encrypted with the user's password. A secret still encrypted with
// `defaultPassword` means the user never chose a lock: detectPasswordState in
// providers/wallet.tsx reports that as 'passwordless', and the app must send
// the user through the lock setup before letting them in.

import { getPrivateKey, setPrivateKey } from './privateKey'
import { hasMnemonic, getMnemonic, setMnemonic } from './mnemonic'

/**
 * Re-encrypt the stored wallet secret from one password to another. The secret
 * is the mnemonic when present (the primary store that lock detection and
 * unlockWallet read), otherwise the raw private key.
 */
export const reencryptSecret = async (fromPassword: string, toPassword: string): Promise<void> => {
  try {
    if (hasMnemonic()) {
      const mnemonic = await getMnemonic(fromPassword)
      await setMnemonic(mnemonic, toPassword)
    } else {
      const privateKey = await getPrivateKey(fromPassword)
      await setPrivateKey(privateKey, toPassword)
    }
  } catch (err) {
    // Web Crypto reports a failed decrypt as a bare OperationError whose message
    // ("The operation failed for an operation-specific reason") says nothing.
    // Mirrors how unlockWallet translates the same exception.
    if (err instanceof DOMException) throw new Error('Wrong password for the stored wallet secret')
    throw err
  }
}
