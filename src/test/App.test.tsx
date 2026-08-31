import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { AspContext } from '../providers/asp'
import { ConfigContext } from '../providers/config'
import { FlowContext } from '../providers/flow'
import { NavigationContext, Pages, Tabs } from '../providers/navigation'
import { OptionsContext } from '../providers/options'
import { WalletContext, type WalletAuthState } from '../providers/wallet'
import {
  mockAspContextValue,
  mockConfigContextValue,
  mockFlowContextValue,
  mockNavigationContextValue,
  mockOptionsContextValue,
  mockWalletContextValue,
} from './screens/mocks'
import { defaultPassword } from '../lib/constants'
import { detectJSCapabilities } from '../lib/jsCapabilities'
import { SettingsOptions } from '../lib/types'

vi.mock('../lib/jsCapabilities', () => ({
  detectJSCapabilities: vi.fn().mockResolvedValue({ isSupported: true }),
}))

function renderApp({
  authState,
  initialized,
  unlockWallet = vi.fn().mockResolvedValue(undefined),
  screen: screenOverride = Pages.Init,
  tab: tabOverride = Tabs.None,
  option,
}: {
  authState: WalletAuthState
  initialized: boolean
  unlockWallet?: ReturnType<typeof vi.fn>
  screen?: Pages
  tab?: Tabs
  option?: SettingsOptions
}) {
  const navigate = vi.fn()

  render(
    <NavigationContext.Provider
      value={{ ...mockNavigationContextValue, navigate, screen: screenOverride, tab: tabOverride }}
    >
      <AspContext.Provider value={mockAspContextValue as any}>
        <ConfigContext.Provider value={{ ...mockConfigContextValue, configLoaded: true } as any}>
          <FlowContext.Provider value={mockFlowContextValue as any}>
            <OptionsContext.Provider
              value={{ ...mockOptionsContextValue, ...(option !== undefined && { option }) } as any}
            >
              <WalletContext.Provider
                value={{
                  ...mockWalletContextValue,
                  authState,
                  initialized,
                  dataReady: initialized,
                  unlockWallet,
                  walletLoaded: true,
                  wallet: { nextRollover: 0, pubkey: 'stored-pubkey' },
                }}
              >
                <App />
              </WalletContext.Provider>
            </OptionsContext.Provider>
          </FlowContext.Provider>
        </ConfigContext.Provider>
      </AspContext.Provider>
    </NavigationContext.Provider>,
  )

  return { navigate, unlockWallet }
}

function setupTestEnvironment() {
  sessionStorage.clear()
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
  vi.mocked(detectJSCapabilities).mockResolvedValue({ isSupported: true })
  vi.stubEnv('VITE_DEV_NSEC', '')
}

describe('App startup routing', () => {
  beforeEach(() => {
    setupTestEnvironment()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('sends passwordless wallets to the lock setup instead of booting them', async () => {
    const { navigate, unlockWallet } = renderApp({ authState: 'passwordless', initialized: false })

    // Every wallet must have a lock: a secret that still decrypts with
    // `defaultPassword` means none was ever chosen, so the wallet is held in
    // the setup rather than silently unlocked.
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(Pages.InitBiometric))
    expect(unlockWallet).not.toHaveBeenCalledWith(defaultPassword)
    expect(navigate).not.toHaveBeenCalledWith(Pages.Unlock)
  })

  it('leaves the lock setup alone once the user is on it', async () => {
    const { navigate } = renderApp({
      authState: 'passwordless',
      initialized: false,
      screen: Pages.InitPassword,
    })

    // The setup spans two screens; the gate must not yank the user back to the
    // biometric step when they pick "use password instead".
    await waitFor(() => expect(screen.getByTestId('app')).toBeInTheDocument())
    expect(navigate).not.toHaveBeenCalledWith(Pages.InitBiometric)
  })

  it('does not hold a passwordless wallet on the loading screen', async () => {
    renderApp({ authState: 'passwordless', initialized: false, screen: Pages.InitBiometric })

    // The wallet is deliberately not booted while the lock is missing, so the
    // usual "wait for dataReady" hold must not swallow the setup screens. The
    // loading page renders no page component at all, so any button means the
    // setup is on screen. (Asserting on text would depend on i18n resources.)
    await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(0))
  })

  it('shows unlock when authentication is required', async () => {
    const { navigate } = renderApp({ authState: 'locked', initialized: false })

    expect(await screen.findByText(/Unlock/)).toBeInTheDocument()
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(Pages.Unlock))
  })

  it('shows unlock even when the wallet remains initialized', async () => {
    const { navigate } = renderApp({ authState: 'locked', initialized: true })

    expect(await screen.findByText(/Unlock/)).toBeInTheDocument()
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(Pages.Unlock))
  })

  it('keeps authenticated but uninitialized wallets on loading', async () => {
    const { navigate, unlockWallet } = renderApp({ authState: 'authenticated', initialized: false })

    await waitFor(() => expect(screen.getByTestId('app')).toBeInTheDocument())
    expect(unlockWallet).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalledWith(Pages.Unlock)
  })

})

describe('Navbar visibility', () => {
  beforeEach(() => {
    setupTestEnvironment()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('hides navbar on unlock screen even when navigation context has Wallet tab', async () => {
    renderApp({ authState: 'locked', initialized: false, screen: Pages.Wallet, tab: Tabs.Wallet })

    await screen.findByText(/Unlock/)
    const ionApp = screen.getByTestId('app')
    expect(ionApp.className).not.toContain('has-pill-navbar')
  })

  it('hides navbar during loading hold', async () => {
    renderApp({ authState: 'authenticated', initialized: false, screen: Pages.Wallet, tab: Tabs.Wallet })

    const ionApp = await screen.findByTestId('app')
    expect(ionApp.className).not.toContain('has-pill-navbar')
  })

  it('shows navbar on wallet root when authenticated and initialized', async () => {
    renderApp({ authState: 'authenticated', initialized: true, screen: Pages.Wallet, tab: Tabs.Wallet })

    const ionApp = await screen.findByTestId('app')
    expect(ionApp.className).toContain('has-pill-navbar')
  })

  it('shows navbar on apps root when authenticated and initialized', async () => {
    renderApp({ authState: 'authenticated', initialized: true, screen: Pages.Apps, tab: Tabs.Apps })

    const ionApp = await screen.findByTestId('app')
    expect(ionApp.className).toContain('has-pill-navbar')
  })

  it('shows navbar on settings menu when authenticated and initialized', async () => {
    renderApp({
      authState: 'authenticated',
      initialized: true,
      screen: Pages.Settings,
      tab: Tabs.Settings,
      option: SettingsOptions.Menu,
    })

    const ionApp = await screen.findByTestId('app')
    expect(ionApp.className).toContain('has-pill-navbar')
  })

  it('hides navbar on settings sub-page when authenticated and initialized', async () => {
    renderApp({
      authState: 'authenticated',
      initialized: true,
      screen: Pages.Settings,
      tab: Tabs.Settings,
      option: SettingsOptions.Password,
    })

    const ionApp = await screen.findByTestId('app')
    expect(ionApp.className).not.toContain('has-pill-navbar')
  })
})
