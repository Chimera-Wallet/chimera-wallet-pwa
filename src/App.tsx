import { AnimatePresence } from 'framer-motion'
import { ConfigContext } from './providers/config'
import { NavigationContext, pageComponent, Pages, Tabs, type NavigationDirection } from './providers/navigation'
import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isInAppBrowser } from './lib/browser'
import { detectJSCapabilities } from './lib/jsCapabilities'
import { OptionsContext } from './providers/options'
import { WalletContext } from './providers/wallet'
import { FlowContext } from './providers/flow'
import { SettingsOptions } from './lib/types'
import { AspContext } from './providers/asp'
import { hapticLight } from './lib/haptics'
import { setBootAnimActive as syncBootAnimFlag } from './lib/logoAnchor'
import { PageTransition } from './components/PageTransition'
import BootError from './components/BootError'
import LoadingLogo from './components/LoadingLogo'
import Loading from './components/Loading'
import PillNavbarOverlay from './components/PillNavbarOverlay'
import { useReducedMotion } from './hooks/useReducedMotion'
import { useLoadingStatus } from './hooks/useLoadingStatus'
import { getMissingRequiredConfig, logMissingRequiredConfig } from './lib/requiredConfig'
import IntercomMessenger from './components/IntercomMessenger'
import Verification from './screens/Settings/Verification'
import { setupPeriodicUpdateCheck } from './lib/serviceWorkerUpdate'

// Screens that make up the mandatory lock setup. While a stored wallet has no
// lock the user is held here and cannot reach the rest of the app.
const LOCK_SETUP_PAGES = new Set([Pages.InitBiometric, Pages.InitPassword])

function PageAnimWrapper({
  children,
  animated,
  direction,
}: {
  children: ReactNode
  animated: boolean
  direction: NavigationDirection | 'none'
}) {
  if (!animated) return <>{children}</>
  return (
    <AnimatePresence mode='sync' initial={false} custom={direction}>
      {children}
    </AnimatePresence>
  )
}

export default function App() {
  const { aspInfo } = useContext(AspContext)
  const { configLoaded } = useContext(ConfigContext)
  const { direction, navigate, navigationData, screen, tab } = useContext(NavigationContext)
  const { initInfo } = useContext(FlowContext)
  const { option, setOption } = useContext(OptionsContext)
  const { authState, walletLoaded, initialized, wallet, dataReady, loadError } = useContext(WalletContext)

  const loadingStatus = useLoadingStatus()
  const isIAB = useMemo(() => isInAppBrowser(), [])

  // Required deployment config (asset IDs, Arkade Wrap API, ark server). If any
  // is missing the app is misconfigured and must not proceed.
  const missingConfig = useMemo(() => getMissingRequiredConfig(), [])
  useEffect(() => {
    logMissingRequiredConfig(missingConfig)
  }, [missingConfig])

  const [isCapable, setIsCapable] = useState(false)
  const [jsCapabilitiesChecked, setJsCapabilitiesChecked] = useState(false)
  const [bootAnimActive, setBootAnimActive] = useState(false)
  // Syncs the external store before React re-renders, so Wallet reads
  // the correct value on the same frame LoadingLogo unmounts.
  const updateBootAnim = useCallback((active: boolean) => {
    syncBootAnimFlag(active)
    setBootAnimActive(active)
  }, [])
  const [bootAnimDone, setBootAnimDone] = useState(false)
  const [bootExitMode, setBootExitMode] = useState<'fly-to-target' | 'fly-up'>('fly-up')

  // The init/restore flow carries the secret in `initInfo` from the moment the
  // wallet is created or restored until the lock is set. While that is set the
  // user is mid-onboarding, so neither the loading hold nor the lock gate below
  // may redirect them — they still have to see the backup screens.
  const isInInitFlow = !!(initInfo.password || initInfo.privateKey || initInfo.mnemonic)

  // lock screen orientation to portrait
  const orientation = window.screen.orientation as any
  if (orientation && typeof orientation.lock === 'function') {
    orientation.lock('portrait').catch(() => {})
  }

  // Check JavaScript capabilities on mount
  useEffect(() => {
    detectJSCapabilities()
      .then((res) => setIsCapable(res.isSupported))
      .catch(() => setIsCapable(false))
      .finally(() => setJsCapabilitiesChecked(true))
  }, [])

  // Setup periodic service worker update checks
  useEffect(() => {
    const cleanup = setupPeriodicUpdateCheck(60)
    return cleanup
  }, [])

  // Global escape key to go back to wallet
  useEffect(() => {
    if (!navigate) return
    const handleGlobalDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') navigate(Pages.Wallet)
    }
    window.addEventListener('keydown', handleGlobalDown)
    return () => window.removeEventListener('keydown', handleGlobalDown)
  }, [navigate])

  useEffect(() => {
    if (isIAB) return navigate(Pages.InAppBrowser)
    if (missingConfig.length) return navigate(Pages.Unavailable)
    if (aspInfo.unreachable) return navigate(Pages.Unavailable)
    if (jsCapabilitiesChecked && !isCapable) return navigate(Pages.Unavailable)
    // avoid redirect if the user is still setting up the wallet
    if (isInInitFlow) return
    if (!walletLoaded) return navigate(Pages.Loading)
    // dev auto-init: stay on loading screen while VITE_DEV_NSEC initializes the wallet
    if (import.meta.env.DEV && import.meta.env.VITE_DEV_NSEC && !initialized) return
    if (!wallet.pubkey) return navigate(Pages.Init)
    if (authState === 'locked') return navigate(Pages.Unlock)
  }, [walletLoaded, wallet.pubkey, authState, initInfo, aspInfo.unreachable, jsCapabilitiesChecked, isCapable, missingConfig])

  const handleCard = () => {
    hapticLight()
    navigate(Pages.AppCardReservation)
  }

  const handleTrade = () => {
    hapticLight()
    navigate(Pages.AppSwap)
  }

  const handleWallet = () => {
    hapticLight()
    navigate(Pages.Wallet)
  }

  const handleApps = () => {
    hapticLight()
    navigate(Pages.Apps)
  }

  const handleSettings = () => {
    hapticLight()
    setOption(SettingsOptions.Menu)
    navigate(Pages.Settings)
  }

  const prefersReduced = useReducedMotion()
  const effectiveDirection = prefersReduced ? 'none' : direction

  // New users (no wallet in storage) skip straight to Init — the logo morph animation
  // serves as the intro visual while ASP and JS capability checks resolve in the background.
  // Init doesn't need ASP or crypto until "Create wallet" is clicked.
  const aspReady = aspInfo.signerPubkey || aspInfo.unreachable
  const isNewUser = walletLoaded && !wallet.pubkey
  const allChecksReady = jsCapabilitiesChecked && configLoaded && aspReady
  const hasStoredWallet = walletLoaded && !!wallet.pubkey
  const shouldShowUnlock = hasStoredWallet && authState === 'locked' && !aspInfo.unreachable
  // A stored wallet whose secret still decrypts with `defaultPassword` has no
  // lock: it would boot straight into the wallet on every launch. That happens
  // to wallets created before the lock step was mandatory, and to onboarding
  // interrupted between InitConnect and the lock screens. Every wallet must
  // have a lock, so hold the user in the lock setup until one is configured.
  const needsLockSetup = hasStoredWallet && authState === 'passwordless' && !isInInitFlow
  // Hold the loading screen during boot until wallet data is ready.
  // Skip during the init/connect flow (creating or restoring a wallet) so the
  // Connect component stays mounted and can run swap recovery before navigating,
  // and while the lock setup is up — that wallet is deliberately not booted yet.
  const shouldHoldOnLoading =
    hasStoredWallet && (!initialized || !dataReady) && authState !== 'locked' && !isInInitFlow && !needsLockSetup

  // Pull the user back whenever they leave the lock setup without finishing it
  // (back button, deep link, a redirect from another effect). The setup itself
  // spans two screens, so navigating between them is allowed.
  useEffect(() => {
    if (!allChecksReady || !needsLockSetup) return
    if (LOCK_SETUP_PAGES.has(screen)) return
    navigate(Pages.InitBiometric)
  }, [allChecksReady, needsLockSetup, screen, navigate])

  // After a successful unlock + data load, the Unlock screen is replaced by the
  // Loading page (shouldHoldOnLoading=true) until dataReady flips — at which
  // point App falls back to `screen` which is still Pages.Unlock. We need to
  // explicitly redirect to Wallet at that moment.
  useEffect(() => {
    if (authState === 'authenticated' && dataReady && screen === Pages.Unlock) {
      navigate(Pages.Wallet)
    }
  }, [authState, dataReady, screen, navigate])

  const page = missingConfig.length
    ? Pages.Unavailable
    : !(allChecksReady || isNewUser)
      ? Pages.Loading
      : shouldHoldOnLoading
        ? Pages.Loading
        : shouldShowUnlock
          ? Pages.Unlock
          : // Resolve to the setup itself rather than pinning a single page, so
            // the user can still move between the biometric and password steps.
            needsLockSetup && !LOCK_SETUP_PAGES.has(screen)
            ? Pages.InitBiometric
            : screen

  // Boot animation: persists on Loading, then flies to the LogoIcon position when
  // Wallet is reached. For any other destination (Unlock, Init, etc.), exits with fly-up.
  // Skip in dev with VITE_DEV_NSEC — the fast auto-init races with the animation.
  useEffect(() => {
    if (import.meta.env.DEV && import.meta.env.VITE_DEV_NSEC) return

    if (page === Pages.Loading && !bootAnimActive) {
      setBootAnimDone(false)
      setBootExitMode('fly-up')
      updateBootAnim(true)
      return
    }

    if (!bootAnimActive || bootAnimDone) return

    if (page === Pages.Wallet) {
      setBootExitMode('fly-to-target')
      setBootAnimDone(true)
      return
    }

    if (page !== Pages.Loading) {
      setBootExitMode('fly-up')
      setBootAnimDone(true)
    }
  }, [page, bootAnimActive, bootAnimDone])

  const handleBootAnimComplete = useCallback(() => {
    updateBootAnim(false)
  }, [updateBootAnim])

  // Chimera loading screen has no exit animation — dismiss the overlay immediately
  // once the app signals it is done loading.
  useEffect(() => {
    if (bootAnimDone) handleBootAnimComplete()
  }, [bootAnimDone, handleBootAnimComplete])

  const comp = page === Pages.Loading ? null : pageComponent(page, navigationData)
  const isSettingsRoot = screen === Pages.Settings && option === SettingsOptions.Menu
  const showNavbar =
    page === screen &&
    (screen === Pages.Wallet ||
      screen === Pages.Apps ||
      screen === Pages.AppCardReservation ||
      screen === Pages.AppSwap ||
      isSettingsRoot)

  return (
    <div className={showNavbar ? 'page has-pill-navbar' : 'page'} data-testid='app'>
      <PageAnimWrapper animated={!prefersReduced} direction={effectiveDirection}>
        <PageTransition key={String(page)} direction={direction} pageKey={String(page)}>
          {comp}
        </PageTransition>
      </PageAnimWrapper>
      {tab !== Tabs.None && !bootAnimActive && (
        <PillNavbarOverlay
          visible={showNavbar}
          activeTab={tab}
          onCardClick={handleCard}
          onTradeClick={handleTrade}
          onWalletClick={handleWallet}
          onAppsClick={handleApps}
          onSettingsClick={handleSettings}
        />
      )}
      {bootAnimActive ? (
        loadError ? (
          <BootError />
        ) : (
          <Loading text={loadingStatus} />
        )
      ) : null}
      {/* Verification mounted at App level so it's never unmounted by tab/page changes */}
      {page !== Pages.Loading && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: screen === Pages.SettingsKYC ? 999 : -1,
            visibility: screen === Pages.SettingsKYC ? 'visible' : 'hidden',
            pointerEvents: screen === Pages.SettingsKYC ? 'auto' : 'none',
          }}
        >
          <Verification />
        </div>
      )}
      <IntercomMessenger />
    </div>
  )
}
