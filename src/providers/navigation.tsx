import { ReactNode, createContext, useCallback, useEffect, useRef, useState } from 'react'
import Init from '../screens/Init/Init'
import InitBiometric from '../screens/Init/Biometric'
import InitConnect from '../screens/Init/Connect'
import InitRestore from '../screens/Init/Restore'
import InitPassword from '../screens/Init/Password'
import LoadingLogo from '../components/LoadingLogo'
import NotesRedeem from '../screens/Wallet/Notes/Redeem'
import NotesForm from '../screens/Wallet/Notes/Form'
import NotesSuccess from '../screens/Wallet/Notes/Success'
import ReceiveQRCode from '../screens/Wallet/Receive/QrCode'
import ReceiveAmount from '../screens/Wallet/Receive/Amount'
import ReceiveSuccess from '../screens/Wallet/Receive/Success'
import SendForm from '../screens/Wallet/Send/Form'
import SendDetails from '../screens/Wallet/Send/Details'
import SendSuccess from '../screens/Wallet/Send/Success'
import BankReceive from '../screens/Wallet/Receive/BankReceive'
import BankSend from '../screens/Wallet/Send/BankSend'
import WrapReceive from '../screens/Wallet/Receive/WrapReceive'
import UnwrapSend from '../screens/Wallet/Send/UnwrapSend'
import BankOrderStatus from '../screens/Wallet/BankOrderStatus'
import BankOrderHistory from '../screens/Wallet/BankOrderHistory'
import Transaction from '../screens/Wallet/Transaction'
import Transactions from '../screens/Wallet/Transactions'
import Unlock from '../screens/Wallet/Unlock'
import Vtxos from '../screens/Settings/Vtxos'
import Wallet from '../screens/Wallet/Index'
import Settings from '../screens/Settings/Index'

import Apps from '../screens/Apps/Index'
import AppBoltz from '../screens/Apps/Boltz/Index'
import AppBoltzSettings from '../screens/Apps/Boltz/Settings'
import InitSuccess from '../screens/Init/Success'
import InitBackupKey from '../screens/Init/BackupKey'
import InitBackupWarning from '../screens/Init/BackupWarning'
import AppBoltzSwap from '../screens/Apps/Boltz/Swap'
import AppLendasat from '../screens/Apps/Lendasat/Index'
import AppSatora from '../screens/Apps/Satora/Index'
import AppAssets from '../screens/Apps/Assets/Index'
import AppAssetDetail from '../screens/Apps/Assets/Detail'
import AppAssetImport from '../screens/Apps/Assets/Import'
import AppAssetMint from '../screens/Apps/Assets/Mint'
import AppAssetMintSuccess from '../screens/Apps/Assets/MintSuccess'
import AppAssetReissue from '../screens/Apps/Assets/Reissue'
import AppAssetBurn from '../screens/Apps/Assets/Burn'
import AppAssetsSettings from '../screens/Apps/Assets/Settings'
import InAppBrowser from '../screens/Wallet/InAppBrowser'
import AppStatement from '../screens/Apps/Statement/Index'
import AppReferral from '../screens/Apps/Referral/Index'
import AppGiftCards from '../screens/Apps/GiftCards/Index'
import AppGiftCardPurchase from '../screens/Apps/GiftCards/Purchase'
import AppGiftCardRedeem from '../screens/Apps/GiftCards/Redeem'
import AppCardReservation from '../screens/Apps/CardReservation/Index'
import AppSwap from '../screens/Apps/Swap/Index'
import AppSwapOrderDetails from '../screens/Apps/Swap/OrderDetails'
import AppAddressBook from '../screens/Apps/AddressBook/Index'
import AppAddressBookForm from '../screens/Apps/AddressBook/Form'
import AppAddressBookContact from '../screens/Apps/AddressBook/ContactDetail'
import Unavailable from '../screens/Wallet/Unavailable'
import Verification from '../screens/Settings/Verification'
import { trackPageView } from '../lib/analytics'

export type NavigationDirection = 'forward' | 'back' | 'none'

export enum Pages {
  AppBoltz,
  AppBoltzSettings,
  AppBoltzSwap,
  AppLendasat,
  AppSatora,
  AppAssets,
  AppAssetDetail,
  AppAssetImport,
  AppAssetMint,
  AppAssetMintSuccess,
  AppAssetReissue,
  AppAssetBurn,
  AppAssetsSettings,
  AppStatement,
  AppReferral,
  AppGiftCards,
  AppGiftCardPurchase,
  AppGiftCardRedeem,
  AppCardReservation,
  AppSwap,
  AppSwapOrderDetails,
  AppAddressBook,
  AppAddressBookForm,
  AppAddressBookContact,
  Apps,
  Init,
  InitRestore,
  InitPassword,
  InitBiometric,
  InitConnect,
  InAppBrowser,
  InitSuccess,
  InitBackupKey,
  InitBackupWarning,
  Loading,
  NotesRedeem,
  NotesForm,
  NotesSuccess,
  ReceiveAmount,
  ReceiveQRCode,
  ReceiveSuccess,
  WrapReceive,
  UnwrapSend,
  BankReceive,
  BankSend,
  BankOrderStatus,
  BankOrderHistory,
  SendForm,
  SendDetails,
  SendSuccess,
  Settings,
  SettingsKYC,
  Transaction,
  Transactions,
  Unavailable,
  Unlock,
  Vtxos,
  Wallet,
}

export enum Tabs {
  Apps = 'apps',
  Card = 'card',
  None = 'none',
  Settings = 'settings',
  Trade = 'trade',
  Wallet = 'wallet',
}

const pageTab: Record<Pages, Tabs> = {
  [Pages.AppBoltz]: Tabs.Apps,
  [Pages.AppBoltzSettings]: Tabs.Apps,
  [Pages.AppBoltzSwap]: Tabs.Apps,
  [Pages.AppLendasat]: Tabs.Apps,
  [Pages.AppSatora]: Tabs.Apps,
  [Pages.AppAssets]: Tabs.Apps,
  [Pages.AppAssetDetail]: Tabs.Apps,
  [Pages.AppAssetImport]: Tabs.Apps,
  [Pages.AppAssetMint]: Tabs.Apps,
  [Pages.AppAssetMintSuccess]: Tabs.Apps,
  [Pages.AppAssetReissue]: Tabs.Apps,
  [Pages.AppAssetBurn]: Tabs.Apps,
  [Pages.AppAssetsSettings]: Tabs.Apps,
  [Pages.AppStatement]: Tabs.Apps,
  [Pages.AppReferral]: Tabs.Apps,
  [Pages.AppGiftCards]: Tabs.Apps,
  [Pages.AppGiftCardPurchase]: Tabs.Apps,
  [Pages.AppGiftCardRedeem]: Tabs.Apps,
  [Pages.AppCardReservation]: Tabs.Card,
  [Pages.AppSwap]: Tabs.Trade,
  [Pages.AppSwapOrderDetails]: Tabs.Trade,
  [Pages.AppAddressBook]: Tabs.Apps,
  [Pages.AppAddressBookForm]: Tabs.Apps,
  [Pages.AppAddressBookContact]: Tabs.Apps,
  [Pages.Apps]: Tabs.Apps,
  [Pages.Init]: Tabs.None,
  [Pages.InitRestore]: Tabs.None,
  [Pages.InitPassword]: Tabs.None,
  [Pages.InitBiometric]: Tabs.None,
  [Pages.InitConnect]: Tabs.None,
  [Pages.InAppBrowser]: Tabs.None,
  [Pages.InitSuccess]: Tabs.None,
  [Pages.InitBackupKey]: Tabs.None,
  [Pages.InitBackupWarning]: Tabs.None,
  [Pages.Loading]: Tabs.None,
  [Pages.NotesRedeem]: Tabs.Settings,
  [Pages.NotesForm]: Tabs.Settings,
  [Pages.NotesSuccess]: Tabs.Settings,
  [Pages.ReceiveAmount]: Tabs.Wallet,
  [Pages.ReceiveQRCode]: Tabs.Wallet,
  [Pages.ReceiveSuccess]: Tabs.Wallet,
  [Pages.WrapReceive]: Tabs.Wallet,
  [Pages.UnwrapSend]: Tabs.Wallet,
  [Pages.BankReceive]: Tabs.Wallet,
  [Pages.BankSend]: Tabs.Wallet,
  [Pages.BankOrderStatus]: Tabs.Wallet,
  [Pages.BankOrderHistory]: Tabs.Wallet,
  [Pages.SendForm]: Tabs.Wallet,
  [Pages.SendDetails]: Tabs.Wallet,
  [Pages.SendSuccess]: Tabs.Wallet,
  [Pages.Settings]: Tabs.Settings,
  [Pages.SettingsKYC]: Tabs.Settings,
  [Pages.Transaction]: Tabs.Wallet,
  [Pages.Transactions]: Tabs.Wallet,
  [Pages.Unavailable]: Tabs.None,
  [Pages.Unlock]: Tabs.None,
  [Pages.Vtxos]: Tabs.Settings,
  [Pages.Wallet]: Tabs.Wallet,
}

// Root pages of each tab — tab switches between these get no animation
const ROOT_PAGES = new Set([Pages.AppCardReservation, Pages.AppSwap, Pages.Wallet, Pages.Apps, Pages.Settings])

// Coordination point for sub-navigation (e.g., Settings options)
// Sub-navigation providers register here so the main popstate handler can delegate
// Shared flag: set by goBack() before calling history.back(), read by popstate handler
// Lets us distinguish back-button presses (animate) from swipe gestures (no animation)
export const isButtonBack = { current: false }

// Coordination point for sub-navigation (e.g., Settings options)
export const subNavHandler = {
  canGoBack: () => false as boolean,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  goBack: (_fromButton: boolean) => {},
  getDepth: () => 0,
  reset: () => {},
}

export const pageComponent = (page: Pages, navigationData?: Record<string, unknown>): JSX.Element => {
  switch (page) {
    case Pages.AppBoltz:
      return <AppBoltz />
    case Pages.AppBoltzSettings:
      return <AppBoltzSettings />
    case Pages.AppBoltzSwap:
      return <AppBoltzSwap />
    case Pages.AppLendasat:
      return <AppLendasat />
    case Pages.AppSatora:
      return <AppSatora />
    case Pages.AppAssets:
      return <AppAssets />
    case Pages.AppAssetDetail:
      return <AppAssetDetail />
    case Pages.AppAssetImport:
      return <AppAssetImport />
    case Pages.AppAssetMint:
      return <AppAssetMint />
    case Pages.AppAssetMintSuccess:
      return <AppAssetMintSuccess />
    case Pages.AppAssetReissue:
      return <AppAssetReissue />
    case Pages.AppAssetBurn:
      return <AppAssetBurn />
    case Pages.AppAssetsSettings:
      return <AppAssetsSettings />
    case Pages.AppStatement:
      return <AppStatement />
    case Pages.AppReferral:
      return <AppReferral />
    case Pages.AppGiftCards:
      return <AppGiftCards />
    case Pages.AppGiftCardPurchase:
      return <AppGiftCardPurchase />
    case Pages.AppGiftCardRedeem:
      return <AppGiftCardRedeem />
    case Pages.AppCardReservation:
      return <AppCardReservation />
    case Pages.AppSwap:
      return <AppSwap />
    case Pages.AppSwapOrderDetails:
      return <AppSwapOrderDetails />
    case Pages.AppAddressBook:
      return <AppAddressBook />
    case Pages.AppAddressBookForm:
      return <AppAddressBookForm />
    case Pages.AppAddressBookContact:
      return <AppAddressBookContact />
    case Pages.Apps:
      return <Apps />
    case Pages.Init:
      return <Init />
    case Pages.InitConnect:
      return <InitConnect />
    case Pages.InitRestore:
      return <InitRestore />
    case Pages.InitPassword:
      return <InitPassword />
    case Pages.InitBiometric:
      return <InitBiometric />
    case Pages.InitSuccess:
      return <InitSuccess />
    case Pages.InitBackupKey:
      return <InitBackupKey />
    case Pages.InitBackupWarning:
      return <InitBackupWarning />
    case Pages.Loading:
      return <LoadingLogo />
    case Pages.NotesRedeem:
      return <NotesRedeem />
    case Pages.NotesForm:
      return <NotesForm />
    case Pages.NotesSuccess:
      return <NotesSuccess />
    case Pages.ReceiveAmount:
      return <ReceiveAmount />
    case Pages.ReceiveQRCode:
      return <ReceiveQRCode />
    case Pages.ReceiveSuccess:
      return <ReceiveSuccess />
    case Pages.WrapReceive:
      return <WrapReceive />
    case Pages.UnwrapSend:
      return <UnwrapSend />
    case Pages.BankReceive:
      return <BankReceive />
    case Pages.BankSend:
      return <BankSend />
    case Pages.BankOrderStatus:
      return <BankOrderStatus />
    case Pages.BankOrderHistory:
      return <BankOrderHistory />
    case Pages.SendForm:
      return <SendForm />
    case Pages.SendDetails:
      return <SendDetails />
    case Pages.SendSuccess:
      return <SendSuccess />
    case Pages.Settings:
      return <Settings />
    case Pages.SettingsKYC:
      return <></> // Verification is rendered persistently in App.tsx to keep iframe alive
    case Pages.Transaction:
      return <Transaction />
    case Pages.Transactions:
      return <Transactions />
    case Pages.Unavailable:
      return <Unavailable />
    case Pages.Unlock:
      return <Unlock />
    case Pages.Vtxos:
      return <Vtxos />
    case Pages.Wallet:
      return <Wallet />
    default:
      return <></>
  }
}

interface NavigationContextProps {
  navigate: (arg0: Pages, data?: Record<string, unknown>) => void
  navigationData?: Record<string, unknown>
  direction: NavigationDirection
  goBack: () => void
  popTo: (page: Pages) => void
  isInitialLoad: boolean
  navigationCount: number
  screen: Pages
  tab: Tabs
}

export const NavigationContext = createContext<NavigationContextProps>({
  direction: 'none',
  goBack: () => {},
  popTo: () => {},
  isInitialLoad: false,
  navigate: () => {},
  navigationCount: 0,
  navigationData: undefined,
  screen: Pages.Init,
  tab: Tabs.None,
})

export const NavigationProvider = ({ children }: { children: ReactNode }) => {
  const [screen, setScreen] = useState(Pages.Init)
  const [tab, setTab] = useState(Tabs.None)
  const [navigationData, setNavigationData] = useState<Record<string, unknown> | undefined>(undefined)
  const [direction, setDirection] = useState<NavigationDirection>('none')
  const [navigationCount, setNavigationCount] = useState(0)

  const screenRef = useRef(Pages.Init)
  const backStack = useRef<Pages[]>([])
  const previousPage = useRef<Pages>(Pages.Init)
  const skipNextPopstate = useRef(false)
  // ignorePops is used to prevent popstate from re-triggering pop() when we
  // manually unwind the internal stack via popTo()
  const ignorePops = useRef(0)

  const isInitialLoad = pageTab[previousPage.current] === Tabs.None && screen === Pages.Wallet

  const handlePopState = useCallback(() => {
    const fromButton = isButtonBack.current
    isButtonBack.current = false

    if (skipNextPopstate.current) {
      skipNextPopstate.current = false
      return
    }

    // delegate to sub-navigation (e.g., Settings options) if it can handle this
    if (subNavHandler.canGoBack()) {
      subNavHandler.goBack(fromButton)
      return
    }

    const stack = backStack.current
    if (stack.length === 0) return

    const prevPage = stack[stack.length - 1]

    // prevent going back to InitConnect or to a loading screen
    if ([Pages.InitConnect, Pages.Loading].includes(prevPage)) {
      stack.pop()
      history.pushState({}, '', '')
      return
    }

    stack.pop()
    previousPage.current = screenRef.current
    setDirection(fromButton ? 'back' : 'none')
    setTab(pageTab[prevPage])
    screenRef.current = prevPage
    setScreen(prevPage)
  }, [])

  useEffect(() => {
    const onPopState = () => {
      if (ignorePops.current > 0) {
        ignorePops.current -= 1
        return
      }
      handlePopState()
    }
    if (typeof window !== 'undefined') {
      // Seed the history stack with one entry so the very first back-press is captured
      history.pushState({}, '', '')
      window.addEventListener('popstate', onPopState)
      return () => window.removeEventListener('popstate', onPopState)
    }
  }, [handlePopState])

  // Track initial page view
  useEffect(() => {
    trackPageView(Pages[screen])
  }, [])

  const goBack = useCallback(() => {
    if (backStack.current.length > 0 || subNavHandler.canGoBack()) {
      isButtonBack.current = true
      history.back()
    }
  }, [])

  const popTo = useCallback(
    (page: Pages) => {
      const stack = backStack.current
      const idx = stack.lastIndexOf(page)
      if (idx === -1) return // target not in stack; do nothing

      const steps = stack.length - 1 - idx
      if (steps <= 0) return

      // Unwind internal stack
      backStack.current = stack.slice(0, idx + 1)

      // Update UI
      previousPage.current = screen
      setDirection('back')
      setTab(pageTab[page])
      setScreen(page)
      setNavigationData(undefined)
      setNavigationCount((prev) => prev + 1)

      // history.go(-N) fires exactly one popstate event regardless of N; suppress it
      ignorePops.current = 1
      history.go(-steps)
    },
    [screen],
  )

  const navigate = (page: Pages, data?: Record<string, unknown>) => {
    const isRootNavigation = ROOT_PAGES.has(page)

    previousPage.current = screenRef.current

    if (isRootNavigation) {
      // tab switch or return to root: clear back stack + sub-nav + remove browser history entries
      const mainEntries = backStack.current.length
      const subEntries = subNavHandler.getDepth()
      const entriesToRemove = mainEntries + subEntries
      backStack.current = []
      if (subEntries > 0) subNavHandler.reset()
      if (entriesToRemove > 0) {
        skipNextPopstate.current = true
        history.go(-entriesToRemove)
      }
      const isSameTab = pageTab[page] === pageTab[screenRef.current]
      const isFromRoot = ROOT_PAGES.has(screenRef.current)
      setDirection(isFromRoot || !isSameTab ? 'none' : 'back')
    } else {
      // forward navigation: push to back stack AND browser history
      backStack.current.push(screenRef.current)
      history.pushState({}, '', '')
      setDirection('forward')
    }

    screenRef.current = page
    setScreen(page)
    setTab(pageTab[page])
    setNavigationData(data)
    setNavigationCount((prev) => prev + 1)

    // Track page view for analytics
    trackPageView(Pages[page])
  }

  return (
    <NavigationContext.Provider
      value={{ direction, goBack, popTo, isInitialLoad, navigate, navigationCount, navigationData, screen, tab }}
    >
      {children}
    </NavigationContext.Provider>
  )
}
