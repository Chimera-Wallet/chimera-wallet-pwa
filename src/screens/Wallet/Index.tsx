import { useContext, useEffect, useState } from 'react'
import Balance from '../../components/Balance'
import ErrorMessage from '../../components/Error'
import TransactionsList from '../../components/TransactionsList'
import AssetList from '../../components/AssetList'
import AssetBalanceView from '../../components/AssetBalanceView'
import { WalletContext } from '../../providers/wallet'
import { AspContext } from '../../providers/asp'
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
import { EmptyTxList } from '../../components/Empty'
import { InfoBox } from '../../components/AlertBox'
import { psaMessage } from '../../lib/constants'
import { AnnouncementContext } from '../../providers/announcements'
import { WalletStaggerContainer, WalletStaggerChild } from '../../components/WalletLoadIn'
import { ASSETS, type AssetSymbol } from '../../lib/assets'
import Header from '../../components/Header'
import TransactionsIcon from '../../icons/Transactions'

export default function Wallet() {
  const { aspInfo } = useContext(AspContext)
  const { announcement } = useContext(AnnouncementContext)
  const { setRecvInfo, setSendInfo } = useContext(FlowContext)
  const { isInitialLoad, navigate } = useContext(NavigationContext)
  const { balance, txs } = useContext(WalletContext)
  const { nudge } = useContext(NudgeContext)

  const [error, setError] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<AssetSymbol | null>(null)
  const shouldStagger = isInitialLoad

  useEffect(() => {
    setError(aspInfo.unreachable)
  }, [aspInfo.unreachable])

  const handleReceive = () => {
    setRecvInfo(emptyRecvInfo)
    navigate(Pages.AssetNetworkSelect, { mode: 'receive' })
  }

  const handleSend = () => {
    setSendInfo(emptySendInfo)
    navigate(Pages.AssetNetworkSelect, { mode: 'send' })
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
      const divisor = Math.pow(10, ASSETS.BTC.precision)
      return balance / divisor
    }
    // Other assets return 0 for now (would come from multi-asset wallet support)
    return 0
  }

  // Render asset detail view
  if (selectedAsset) {
    return (
      <>
        {announcement}
        <Content>
          <Padded>
            <FlexCol>
              <AssetBalanceView
                symbol={selectedAsset}
                balance={getAssetBalance(selectedAsset)}
                onBack={handleBackToAll}
              />
              <FlexRow padding='0.5rem 0'>
                <Button main icon={<SendIcon />} iconPosition='right' label='Send' onClick={handleSend} />
                <Button main icon={<ReceiveIcon />} iconPosition='right' label='Receive' onClick={handleReceive} />
              </FlexRow>
              <TransactionsList filterAsset={selectedAsset} maxItems={4} />
            </FlexCol>
          </Padded>
        </Content>
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
                    <Button main icon={<SendIcon />} iconPosition='right' label='Send' onClick={handleSend} />
                    <Button main icon={<ReceiveIcon />} iconPosition='right' label='Receive' onClick={handleReceive} />
                  </FlexRow>
                </WalletStaggerChild>
                <WalletStaggerChild animate={shouldStagger}>
                  {nudge ? nudge : psaMessage ? <InfoBox html={psaMessage} /> : null}
                </WalletStaggerChild>
              </FlexCol>
              {txs?.length === 0 ? (
                <WalletStaggerChild animate={shouldStagger}>
                  <div style={{ marginTop: '5rem', width: '100%' }}>
                    <EmptyTxList />
                  </div>
                </WalletStaggerChild>
              ) : (
                <WalletStaggerChild animate={shouldStagger}>
                  <TransactionsList maxItems={4} />
                </WalletStaggerChild>
              )}
              <WalletStaggerChild animate={shouldStagger}>
                <AssetList 
                  balances={[{ symbol: ASSETS.BTC.symbol, balance: balance / Math.pow(10, ASSETS.BTC.precision) }]} 
                  onAssetClick={handleAssetClick} 
                />
              </WalletStaggerChild>
            </FlexCol>
          </WalletStaggerContainer>
        </Padded>
      </Content>
    </>
  )
}
