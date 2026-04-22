import { useContext, useEffect, useRef, useState } from 'react'
import { ArkadeUnreachableError, WalletContext } from '../../providers/wallet'
import { FlowContext } from '../../providers/flow'
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
  const { deepLinkInfo } = useContext(FlowContext)

  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [tried, setTried] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [shouldAutoUnlock, setShouldAutoUnlock] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [timeoutReached, setTimeoutReached] = useState(false)
  // Re-entrancy guard for the unlock effect. We can't rely on the `unlocking`
  // state flag alone: setUnlocking(true) is async, and the effect can re-fire
  // synchronously on the next render before React commits the flag. A ref
  // flips immediately. Without this, initWallet() -> updateConfig() causes a
  // WalletProvider re-render -> new initWallet reference -> effect re-fires
  // -> another ServiceWorkerWallet.setup() -> another INITIALIZE_MESSAGE_BUS
  // posted to the worker, and the SDK's waitForInit fires GET /v1/info once
  // per call. We measured ~60 req/s (one per frame) hammering Arkade until
  // it 429s, which is what the HAR showed.
  const unlockInFlight = useRef(false)

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
    // Prevent concurrent/repeated unlock attempts. See unlockInFlight doc above.
    if (unlockInFlight.current) return
    unlockInFlight.current = true

    setUnlocking(true)
    setError('')

    const pass = password ? password : defaultPassword
    getPrivateKey(pass)
      .then(initWallet)
      .then(() => setUnlocked(true))
      .catch((err) => {
        setTried(true)
        setUnlocking(false)
        // initWallet throws ArkadeUnreachableError when we refuse to boot the
        // service worker against a down Arkade server. Don't blame the
        // password: the key decrypted fine, the server is the problem.
        // Surfacing this explicitly avoids the silent half-init state where
        // svcWallet is undefined and every downstream call into the SDK
        // crashes with "Cannot read properties of undefined (reading
        // 'getAddress')".
        if (err instanceof ArkadeUnreachableError) {
          consoleError(err, 'Arkade server unreachable during unlock')
          setError('Arkade server unreachable. Check Settings → Arkade Server.')
          return
        }
        if (password) {
          consoleError(err, 'error unlocking wallet')
          setError('Invalid password')
        } else {
          // Auto-unlock failed, show unlock screen
          consoleError(err, 'Auto-unlock failed')
        }
      })
      .finally(() => {
        // Release the re-entrancy guard so the user can retry after a bad
        // password. Stays true on success until unmount, which is fine —
        // once unlocked, we navigate away and the component unmounts.
        unlockInFlight.current = false
      })
    // `initWallet` is intentionally excluded: it's a WalletProvider context
    // function that's recreated on every provider render, which otherwise
    // turns this effect into a render-rate loop that posts one
    // INITIALIZE_MESSAGE_BUS per frame to the service worker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password, shouldAutoUnlock])

  useEffect(() => {
    if (unlocked && dataReady) {
      setUnlocking(false)
      // If a deep link is pending, let the wallet provider handle navigation
      if (!deepLinkInfo?.appId) {
        navigate(Pages.Wallet)
      }
    }
  }, [unlocked, dataReady, navigate, deepLinkInfo])

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
