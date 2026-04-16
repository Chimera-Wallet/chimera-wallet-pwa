import { useContext, useEffect, useState } from 'react'
import { WalletContext } from '../../providers/wallet'
import { consoleError } from '../../lib/logs'
import { getPrivateKey, noUserDefinedPassword } from '../../lib/privateKey'
import { NavigationContext, Pages } from '../../providers/navigation'
import NeedsPassword from '../../components/NeedsPassword'
import Header from '../../components/Header'
import { defaultPassword } from '../../lib/constants'
import Loading from '../../components/Loading'
import { clearStorage } from '../../lib/storage'

export default function Unlock() {
  const { initWallet, dataReady, wallet, updateWallet } = useContext(WalletContext)
  const { navigate } = useContext(NavigationContext)

  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [tried, setTried] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [shouldAutoUnlock, setShouldAutoUnlock] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [timeoutReached, setTimeoutReached] = useState(false)

  // Reset unlock state when component mounts to prevent stale state
  useEffect(() => {
    return () => {
      // Cleanup on unmount
      setUnlocking(false)
      setUnlocked(false)
    }
  }, [])

  // Check if we should auto-unlock (only if no custom password and no biometrics)
  useEffect(() => {
    const checkAutoUnlock = async () => {
      const hasNoPassword = await noUserDefinedPassword()
      const hasBiometrics = wallet.lockedByBiometrics || false
      // Only auto-unlock if user has no custom password AND no biometrics
      setShouldAutoUnlock(hasNoPassword && !hasBiometrics)
      if (!hasNoPassword || hasBiometrics) {
        // User has a password or biometrics, show the unlock screen
        setTried(true)
      }
    }
    checkAutoUnlock()
  }, [wallet.lockedByBiometrics])

  useEffect(() => {
    // Only attempt unlock if we should auto-unlock OR user has entered a password
    if (!shouldAutoUnlock && !password) return
    
    setUnlocking(true)
    setError('')
    
    const pass = password ? password : defaultPassword
    getPrivateKey(pass)
      .then(initWallet)
      .then(() => setUnlocked(true))
      .catch((err) => {
        setTried(true)
        setUnlocking(false)
        if (password) {
          consoleError(err, 'error unlocking wallet')
          setError('Invalid password')
        } else {
          // Auto-unlock failed, show unlock screen
          consoleError(err, 'Auto-unlock failed')
        }
      })
  }, [password, shouldAutoUnlock, initWallet])

  useEffect(() => {
    if (unlocked && dataReady) {
      setUnlocking(false)
      navigate(Pages.Wallet)
    }
  }, [unlocked, dataReady, navigate])

  // Add timeout to prevent infinite loading
  useEffect(() => {
    if (!unlocking) return
    
    const timeout = setTimeout(() => {
      if (unlocking && !dataReady) {
        setTimeoutReached(true)
        setUnlocking(false)
        setError('Unlock timed out. Please try again.')
        consoleError(new Error('Unlock timeout'), 'Wallet unlock exceeded 30 seconds')
      }
    }, 30000) // 30 second timeout
    
    return () => clearTimeout(timeout)
  }, [unlocking, dataReady])

  // Show loading spinner while unlocking if unlocked but waiting for data
  if (unlocking && !timeoutReached) {
    return <Loading text='Unlocking wallet...' />
  }
  
  // If unlocked but data not ready and timeout not reached, keep showing loading
  if (unlocked && !dataReady && !timeoutReached) {
    return <Loading text='Loading wallet data...' />
  }

  const handleRestore = async () => {
    await clearStorage()
    updateWallet({ network: '', nextRollover: 0 })
    navigate(Pages.InitRestore)
  }

  return tried ? (
    <>
      <Header text='Unlock' />
      <NeedsPassword error={error} onPassword={setPassword} loading={unlocking} onRestore={handleRestore} />
    </>
  ) : (
    <Loading />
  )
}
