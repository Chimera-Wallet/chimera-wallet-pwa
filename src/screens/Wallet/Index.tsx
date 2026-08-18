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
import {
  ASSETS,
  ASSET_LIST,
  getDisplayTicker,
  getWrappedAssetId,
  requireAssetConfig,
  wrappedAmountToNumber,
  type AssetSymbol,
} from '../../lib/assets'
import { assetSupportsWrap, requireAssetChainOption, type SourceChainId } from '../../lib/sourceChains'
import Header from '../../components/Header'
import TransactionsIcon from '../../icons/Transactions'
import AssetSelector from '../../components/AssetSelector'
import NetworkSelector from '../../components/NetworkSelector'
import AssetNetworkSelector, { type AssetNetworkChoice } from '../../components/AssetNetworkSelector'
import { TRANSFER_METHOD, type TransferMethod } from '../../lib/transferMethods'
import StakingBanner from '../../components/StakingBanner'
import InstallBanner from '../../components/InstallBanner'
import BannerCarousel from '../../components/BannerCarousel'
import {useTranslation} from 'react-i18next'

export default function Wallet() {
  const { aspInfo } = useContext(AspContext)
  const { announcement } = useContext(AnnouncementContext)
  const { config, updateConfig } = useContext(ConfigContext)
  const { setRecvInfo, setSendInfo, setWrapRecvInfo, setUnwrapSendInfo } = useContext(FlowContext)
  const { isInitialLoad, navigate, navigationCount, screen } = useContext(NavigationContext)
  const { balance, dataReady, txs, assetBalances } = useContext(WalletContext)
  const { nudge, nudgeVisible, nudgeCheckComplete } = useContext(NudgeContext)

  const pwaInstalled = usePwaInstalled()
  const dismissed = (config?.dismissedBanners ?? []).includes('pwa-install')
  const showPwaBanner = pwaCanInstall() && (isIOS() || isAndroid()) && !pwaInstalled && !dismissed
  
  const {t} = useTranslation()

  const iosInstallDescription = (): string => {
    switch (getIOSBrowser()) {
      case 'safari':
        return t('networks.browser.safariShare')
      case 'chrome':
        return t('networks.browser.chromeShare')
      case 'firefox':
        return t('networks.browser.firefoxShare')
      case 'edge':
        return t('networks.browser.edgeShare')
      default:
        return t('networks.browser.defaultShare')
    }
  }

  const pwaDescription = isIOS()
    ? iosInstallDescription()
    : t('networks.browser.installDescr')

  const [showInstallBanner, setShowInstallBanner] = useState(Boolean(!dismissed && !pwaInstalled))
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

  const handleAssetNetworkChoice = (choice: AssetNetworkChoice) => {
    setShowNetworkSelector(false)
    if (!flowMode) return

    const symbol = requireAssetConfig(selectedFlowAsset).symbol

    if (choice === TRANSFER_METHOD.bank) {
      if (flowMode === 'send') {
        setSendInfo({ ...emptySendInfo, method: TRANSFER_METHOD.bank })
        navigate(Pages.BankSend)
      } else {
        setRecvInfo({ ...emptyRecvInfo, method: TRANSFER_METHOD.bank })
        navigate(Pages.BankReceive)
      }
      setFlowMode(null)
      return
    }

    if (choice === TRANSFER_METHOD.ark) {
      if (flowMode === 'send') {
        setSendInfo({ ...emptySendInfo, method: TRANSFER_METHOD.ark })
        navigate(Pages.SendForm)
      } else {
        setRecvInfo({ ...emptyRecvInfo, method: TRANSFER_METHOD.ark })
        navigate(Pages.ReceiveAmount)
      }
      setFlowMode(null)
      return
    }

    // Native source/destination chain -> Arkade Wrap / Unwrap flow
    const option = requireAssetChainOption(symbol, choice as SourceChainId)
    if (flowMode === 'send') {
      setUnwrapSendInfo({
        assetSymbol: symbol,
        chainId: choice as SourceChainId,
        ticker: option.ticker,
        sender: '',
        receiver: '',
      })
      navigate(Pages.UnwrapSend)
    } else {
      setWrapRecvInfo({
        assetSymbol: symbol,
        chainId: choice as SourceChainId,
        ticker: option.ticker,
        receiver: '',
        sender: '',
      })
      navigate(Pages.WrapReceive)
    }
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

  // Get balance for the selected asset. BTC uses the on-chain sats balance;
  // wrapped assets use their Arkade balance matched by wrapped asset ID.
  const getAssetBalance = (symbol: AssetSymbol): number => {
    if (symbol === ASSETS.BTC.symbol) return fromSatoshis(balance)
    const assetId = getWrappedAssetId(symbol)
    if (!assetId) return 0
    const ab = assetBalances.find((a) => a.assetId === assetId)
    if (!ab) return 0
    // CX wrapped assets map 1-to-1 with the original, so interpret the raw
    // amount with the original asset's precision (not the Arkade metadata).
    const decimals = requireAssetConfig(symbol).precision
    return wrappedAmountToNumber(ab.amount, decimals)
  }

  // Balances for every listed asset, used by the home asset list.
  const assetBalancesForList = ASSET_LIST.map((asset) => ({
    symbol: asset.symbol as AssetSymbol,
    balance: getAssetBalance(asset.symbol as AssetSymbol),
  }))

  // Render asset detail view
  if (selectedAsset) {
    return (
      <>
        <Header text={getDisplayTicker(selectedAsset)} back={handleBackToAll} />
        {announcement}
        <Content>
          <Padded>
            <FlexCol>
              <AssetBalanceView symbol={selectedAsset} balance={getAssetBalance(selectedAsset)} />
              <FlexRow padding='0.5rem 0'>
                <Button icon={<SendIcon />} label={t('common.general.send')} onClick={handleSend} />
                <Button icon={<ReceiveIcon />} label={t('common.general.receive')} onClick={handleReceive} />
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
          assetSupportsWrap(requireAssetConfig(selectedFlowAsset).symbol) ? (
            <AssetNetworkSelector
              assetSymbol={requireAssetConfig(selectedFlowAsset).symbol}
              mode={flowMode === 'send' ? 'send' : 'receive'}
              selected={selectedNetwork as AssetNetworkChoice | undefined}
              onSelect={handleAssetNetworkChoice}
              isOpen={showNetworkSelector}
              setIsOpen={setShowNetworkSelector}
            />
          ) : (
            <NetworkSelector
              selected={selectedNetwork}
              onSelect={handleNetworkSelected}
              isOpen={showNetworkSelector}
              setIsOpen={setShowNetworkSelector}
            />
          )
        ) : null}
      </>
    )
  }

  // Render default wallet view
  return (
    <>
      <Header
        text={t('common.general.wallet')}
        auxIcon={<TransactionsIcon />}
        auxFunc={handleTransactions}
        auxAriaLabel={t('networks.transactions.viewAll')}
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
                  <ErrorMessage error={error} text={t('errors.send.arkade.server')} />
                </WalletStaggerChild>
                <WalletStaggerChild animate={shouldStagger}>
                  <FlexRow padding='0 0 0.5rem 0'>
                    <Button icon={<SendIcon />} label={t('common.general.send')} onClick={handleSend} />
                    <Button icon={<ReceiveIcon />} label={t('common.general.receive')} onClick={handleReceive} />
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
                                label: t('networks.browser.install'),
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
                    {t('networks.transactions.seeAll')}
                  </button>
                </WalletStaggerChild>
              )}
              <WalletStaggerChild animate={shouldStagger}>
                <AssetList
                  balances={assetBalancesForList}
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
        assetSupportsWrap(requireAssetConfig(selectedFlowAsset).symbol) ? (
          <AssetNetworkSelector
            assetSymbol={requireAssetConfig(selectedFlowAsset).symbol}
            mode={flowMode === 'send' ? 'send' : 'receive'}
            selected={selectedNetwork as AssetNetworkChoice | undefined}
            onSelect={handleAssetNetworkChoice}
            isOpen={showNetworkSelector}
            setIsOpen={setShowNetworkSelector}
          />
        ) : (
          <NetworkSelector
            selected={selectedNetwork}
            onSelect={handleNetworkSelected}
            isOpen={showNetworkSelector}
            setIsOpen={setShowNetworkSelector}
          />
        )
      ) : null}
    </>
  )
}
