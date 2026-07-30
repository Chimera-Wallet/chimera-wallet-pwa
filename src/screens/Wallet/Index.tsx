import { useContext, useEffect, useState } from 'react'
import Balance from '../../components/Balance'
import ErrorMessage from '../../components/Error'
import TransactionsList from '../../components/TransactionsList'
import AssetList from '../../components/AssetList'
import AssetBalanceView from '../../components/AssetBalanceView'
import { WalletContext } from '../../providers/wallet'
import { AspContext } from '../../providers/asp'
import { ConfigContext } from '../../providers/config'
import Padded from '../../components/Padded'
import Content from '../../components/Content'
import FlexCol from '../../components/FlexCol'
import Button from '../../components/Button'
import SendIcon from '../../icons/Send'
import ReceiveIcon from '../../icons/Receive'
import FlexRow from '../../components/FlexRow'
import { emptyRecvInfo, emptySendInfo, FlowContext } from '../../providers/flow'
import { NavigationContext, Pages } from '../../providers/navigation'
import { NudgeContext } from '../../providers/nudge'
import { pwaCanInstall, usePwaInstalled, canPromptInstall, promptPwaInstall } from '../../lib/pwa'
import { isIOS, isAndroid, getIOSBrowser } from '../../lib/browser'
import { InfoBox } from '../../components/AlertBox'
import { psaMessage } from '../../lib/constants'
import { AnnouncementContext } from '../../providers/announcements'
import { WalletStaggerContainer, WalletStaggerChild } from '../../components/WalletLoadIn'
import { fromSatoshis } from '../../lib/format'
import { ASSETS, type AssetSymbol } from '../../lib/assets'
import Header from '../../components/Header'
import TransactionsIcon from '../../icons/Transactions'
import AssetSelector from '../../components/AssetSelector'
import NetworkSelector from '../../components/NetworkSelector'
import { TRANSFER_METHOD, type TransferMethod } from '../../lib/transferMethods'
import StakingBanner from '../../components/StakingBanner'
import InstallBanner from '../../components/InstallBanner'
import BannerCarousel from '../../components/BannerCarousel'

export default function Wallet() {
  const { aspInfo } = useContext(AspContext)
  const { announcement } = useContext(AnnouncementContext)
  const { config, updateConfig } = useContext(ConfigContext)
  const { setRecvInfo, setSendInfo } = useContext(FlowContext)
  const { isInitialLoad, navigate, navigationCount, screen } = useContext(NavigationContext)
  const { balance, dataReady, txs } = useContext(WalletContext)
  const { nudge, nudgeVisible, nudgeCheckComplete } = useContext(NudgeContext)

  const pwaInstalled = usePwaInstalled()
  const dismissed = (config?.dismissedBanners ?? []).includes('pwa-install')
  const showPwaBanner = pwaCanInstall() && (isIOS() || isAndroid()) && !pwaInstalled && !dismissed

  const iosInstallDescription = (): string => {
    switch (getIOSBrowser()) {
      case 'safari':
        return "Tap the Share icon in Safari's toolbar, then 'Add to Home Screen'."
      case 'chrome':
        return "Tap the Share icon in Chrome's address bar, then 'Add to Home Screen'."
      case 'firefox':
        return "Tap the menu icon in Firefox, then 'Add to Home Screen'. For full support, open this page in Safari."
      case 'edge':
        return "Tap the menu icon in Edge, then 'Add to Home Screen'. For full support, open this page in Safari."
      default:
        return "Tap the Share icon, then 'Add to Home Screen'. For full support, open this page in Safari."
    }
  }

  const pwaDescription = isIOS()
    ? iosInstallDescription()
    : "Tap 'Install' to add Chimera to your home screen."

  const [showInstallBanner, setShowInstallBanner] = useState(Boolean(!dismissed && !pwaInstalled))
  console.log('showInstallBanner', showInstallBanner, !dismissed, showPwaBanner, pwaInstalled, dismissed)
  const dismissPwaBanner = () => {
    if (!config) return
    const dismissedBanners = [...(config.dismissedBanners ?? []), 'pwa-install']
    updateConfig({ ...config, dismissedBanners })
    setShowInstallBanner(false)
  }

  const [error, setError] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<AssetSymbol | null>(null)
  const shouldStagger = isInitialLoad

  // Modal flow state
  const [flowMode, setFlowMode] = useState<'send' | 'receive' | null>(null)
  const [showAssetSelector, setShowAssetSelector] = useState(false)
  const [showNetworkSelector, setShowNetworkSelector] = useState(false)
  const [selectedFlowAsset, setSelectedFlowAsset] = useState<AssetSymbol>('BTC')
  const [selectedNetwork, setSelectedNetwork] = useState<TransferMethod | undefined>(undefined)

  useEffect(() => {
    setError(aspInfo.unreachable)
  }, [aspInfo.unreachable])

  // Reset to main wallet view when navigating to Pages.Wallet
  useEffect(() => {
    if (screen === Pages.Wallet) {
      setSelectedAsset(null)
    }
  }, [navigationCount, screen])

  const handleReceive = () => {
    setRecvInfo(emptyRecvInfo)
    setFlowMode('receive')

    // If on asset detail view, skip asset selection and go directly to network
    if (selectedAsset) {
      setSelectedFlowAsset(selectedAsset)
      setSelectedNetwork(undefined)
      setShowAssetSelector(false)
      setShowNetworkSelector(true)
    } else {
      setSelectedFlowAsset('BTC')
      setSelectedNetwork(undefined)
      setShowAssetSelector(true)
    }
  }

  const handleSend = () => {
    setSendInfo(emptySendInfo)
    setFlowMode('send')

    // If on asset detail view, skip asset selection and go directly to network
    if (selectedAsset) {
      setSelectedFlowAsset(selectedAsset)
      setSelectedNetwork(undefined)
      setShowAssetSelector(false)
      setShowNetworkSelector(true)
    } else {
      setSelectedFlowAsset('BTC')
      setSelectedNetwork(undefined)
      setShowAssetSelector(true)
    }
  }

  const handleAssetSelected = (asset: AssetSymbol) => {
    setSelectedFlowAsset(asset)
    setShowAssetSelector(false)
    setShowNetworkSelector(true)
  }

  const handleNetworkSelected = (network: TransferMethod) => {
    setSelectedNetwork(network)
    setShowNetworkSelector(false)

    if (!flowMode) return

    // Update flow context and navigate based on mode and network
    if (flowMode === 'send') {
      setSendInfo({ ...emptySendInfo, method: network })

      if (network === TRANSFER_METHOD.bank) {
        navigate(Pages.BankSend)
      } else {
        navigate(Pages.SendForm)
      }
    } else {
      setRecvInfo({ ...emptyRecvInfo, method: network })

      if (network === TRANSFER_METHOD.bank) {
        navigate(Pages.BankReceive)
      } else {
        navigate(Pages.ReceiveAmount)
      }
    }

    // Reset flow state
    setFlowMode(null)
  }

  const handleAssetClick = (symbol: AssetSymbol) => {
    setSelectedAsset(symbol)
  }

  const handleBackToAll = () => {
    setSelectedAsset(null)
  }

  const handleTransactions = () => {
    navigate(Pages.Transactions)
  }

  // Get balance for the selected asset (currently only BTC is supported)
  const getAssetBalance = (symbol: AssetSymbol): number => {
    // Currently all balance is BTC, so return the wallet balance only for BTC
    if (symbol === ASSETS.BTC.symbol) {
      return fromSatoshis(balance)
    }
    // Other assets return 0 for now (would come from multi-asset wallet support)
    return 0
  }

  // Render asset detail view
  if (selectedAsset) {
    return (
      <>
        <Header text={selectedAsset} back={handleBackToAll} />
        {announcement}
        <Content>
          <Padded>
            <FlexCol>
              <AssetBalanceView symbol={selectedAsset} balance={getAssetBalance(selectedAsset)} />
              <FlexRow padding='0.5rem 0'>
                <Button icon={<SendIcon />} label='Send' onClick={handleSend} />
                <Button icon={<ReceiveIcon />} label='Receive' onClick={handleReceive} />
              </FlexRow>
              <TransactionsList filterAsset={selectedAsset} maxItems={4} />
            </FlexCol>
          </Padded>
        </Content>
        {/* Modal selectors - only render when needed */}
        {showAssetSelector ? (
          <AssetSelector
            selected={selectedFlowAsset}
            onSelect={handleAssetSelected}
            isOpen={showAssetSelector}
            setIsOpen={setShowAssetSelector}
          />
        ) : null}
        {showNetworkSelector ? (
          <NetworkSelector
            selected={selectedNetwork}
            onSelect={handleNetworkSelected}
            isOpen={showNetworkSelector}
            setIsOpen={setShowNetworkSelector}
          />
        ) : null}
      </>
    )
  }

  // Render default wallet view
  return (
    <>
      <Header
        text='Wallet'
        auxIcon={<TransactionsIcon />}
        auxFunc={handleTransactions}
        auxAriaLabel='View all transactions'
      />
      {announcement}
      <Content>
        <Padded>
          <WalletStaggerContainer animate={shouldStagger}>
            <FlexCol>
              <FlexCol gap='0'>
                <WalletStaggerChild animate={shouldStagger}>
                  <Balance amount={balance} centered usdOnly />
                </WalletStaggerChild>
                <WalletStaggerChild animate={shouldStagger}>
                  <ErrorMessage error={error} text='Ark server unreachable' />
                </WalletStaggerChild>
                <WalletStaggerChild animate={shouldStagger}>
                  <FlexRow padding='0 0 0.5rem 0'>
                    <Button icon={<SendIcon />} label='Send' onClick={handleSend} />
                    <Button icon={<ReceiveIcon />} label='Receive' onClick={handleReceive} />
                  </FlexRow>
                </WalletStaggerChild>
                <WalletStaggerChild animate={shouldStagger}>
                <div style={{ display: 'flex', flexDirection: 'column', paddingTop: 'var(--banner-padding-top)' }}>
                  <BannerCarousel>
                    <StakingBanner variant='home' />
                    {showInstallBanner ? (
                      <InstallBanner
                        description={pwaDescription}
                        action={
                          canPromptInstall()
                            ? {
                                label: 'Install',
                                onClick: async () => {
                                  const outcome = await promptPwaInstall().catch(() => null)
                                  if (outcome) dismissPwaBanner()
                                },
                              }
                            : undefined
                        }
                        onDismiss={dismissPwaBanner}
                      />
                    ) : null}
                  </BannerCarousel>
                </div>
                </WalletStaggerChild>
                <WalletStaggerChild animate={shouldStagger}>
                  {nudge ? nudge : psaMessage ? <InfoBox html={psaMessage} /> : null}
                </WalletStaggerChild>
              </FlexCol>
              {!dataReady || txs.length === 0 ? null : (
                <WalletStaggerChild animate={shouldStagger}>
                  <TransactionsList maxItems={4} />
                  <button
                    type='button'
                    onClick={handleTransactions}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: 'none',
                      border: '1px solid var(--neutral-200)',
                      borderRadius: '0.5rem',
                      color: 'var(--fg)',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      marginTop: '0.5rem',
                    }}
                  >
                    See all transactions
                  </button>
                </WalletStaggerChild>
              )}
              <WalletStaggerChild animate={shouldStagger}>
                <AssetList
                  balances={[{ symbol: ASSETS.BTC.symbol, balance: fromSatoshis(balance) }]}
                  onAssetClick={handleAssetClick}
                />
              </WalletStaggerChild>
            </FlexCol>
          </WalletStaggerContainer>
        </Padded>
      </Content>
      {/* Modal selectors - only render when needed */}
      {showAssetSelector ? (
        <AssetSelector
          selected={selectedFlowAsset}
          onSelect={handleAssetSelected}
          isOpen={showAssetSelector}
          setIsOpen={setShowAssetSelector}
        />
      ) : null}
      {showNetworkSelector ? (
        <NetworkSelector
          selected={selectedNetwork}
          onSelect={handleNetworkSelected}
          isOpen={showNetworkSelector}
          setIsOpen={setShowNetworkSelector}
        />
      ) : null}
    </>
  )
}
