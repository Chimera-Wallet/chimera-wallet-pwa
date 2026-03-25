/**
 * Asset and Network Selection Screen
 * 
 * First step for Send/Receive flows where user selects:
 * 1. Asset (BTC, etc.)
 * 2. Network/Transfer Method (Bitcoin, Ark, Lightning, Bank)
 * 
 * After both are selected, navigates to the appropriate screen.
 */

import { useContext, useState } from 'react'
import Content from '../../components/Content'
import FlexCol from '../../components/FlexCol'
import Header from '../../components/Header'
import Padded from '../../components/Padded'
import Button from '../../components/Button'
import ButtonsOnBottom from '../../components/ButtonsOnBottom'
import SelectSheet from '../../components/SelectSheet'
import Shadow from '../../components/Shadow'
import FlexRow from '../../components/FlexRow'
import Text, { TextLabel } from '../../components/Text'
import AssetIcon from '../../icons/AssetIcon'
import ChevronDown from '../../icons/ChevronDown'
import { ASSETS, ASSET_LIST, type AssetSymbol } from '../../lib/assets'
import { TRANSFER_METHOD, TRANSFER_METHOD_LABELS, TRANSFER_METHOD_OPTIONS } from '../../lib/transferMethods'
import { NavigationContext, Pages } from '../../providers/navigation'
import { FlowContext } from '../../providers/flow'

interface AssetNetworkSelectProps {
  mode: 'send' | 'receive'
}

export default function AssetNetworkSelect({ mode }: AssetNetworkSelectProps) {
  const { navigate, goBack } = useContext(NavigationContext)
  const { sendInfo, setSendInfo, recvInfo, setRecvInfo } = useContext(FlowContext)

  // For now, only BTC is supported, but keep the selector for future expansion
  const [selectedAsset, setSelectedAsset] = useState<AssetSymbol>('BTC')
  const [selectedNetwork, setSelectedNetwork] = useState<string | null>(null)
  const [assetSheetOpen, setAssetSheetOpen] = useState(false)
  const [networkSheetOpen, setNetworkSheetOpen] = useState(false)

  const handleContinue = () => {
    if (!selectedAsset || !selectedNetwork) return

    // Update flow context with selected method
    if (mode === 'send') {
      setSendInfo({ ...sendInfo, method: selectedNetwork as any })
      
      // Navigate based on network
      if (selectedNetwork === TRANSFER_METHOD.bank) {
        navigate(Pages.BankSend)
      } else {
        navigate(Pages.SendForm)
      }
    } else {
      setRecvInfo({ ...recvInfo, method: selectedNetwork as any })
      
      // Navigate based on network
      if (selectedNetwork === TRANSFER_METHOD.bank) {
        navigate(Pages.BankReceive)
      } else {
        navigate(Pages.ReceiveAmount)
      }
    }
  }

  const canContinue = selectedAsset && selectedNetwork

  return (
    <>
      <Header text={mode === 'send' ? 'Send' : 'Receive'} back={goBack} />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
            {/* Asset Selection */}
            <FlexCol gap='0.5rem'>
              <TextLabel>Asset</TextLabel>
              <Shadow input onClick={() => setAssetSheetOpen(true)}>
                <FlexRow between>
                  <FlexRow gap='0.5rem'>
                    <AssetIcon symbol={selectedAsset} size={24} />
                    <Text>{ASSETS[selectedAsset].name}</Text>
                  </FlexRow>
                  <ChevronDown />
                </FlexRow>
              </Shadow>
            </FlexCol>

            {/* Network Selection */}
            <FlexCol gap='0.5rem'>
              <TextLabel>Network</TextLabel>
              <Shadow input onClick={() => setNetworkSheetOpen(true)}>
                <FlexRow between>
                  <Text>
                    {selectedNetwork ? TRANSFER_METHOD_LABELS[selectedNetwork as keyof typeof TRANSFER_METHOD_LABELS] : 'Select network'}
                  </Text>
                  <ChevronDown />
                </FlexRow>
              </Shadow>
            </FlexCol>
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button
          label='Continue'
          onClick={handleContinue}
          disabled={!canContinue}
        />
      </ButtonsOnBottom>

      {/* Asset Selection Sheet */}
      <SelectSheet
        isOpen={assetSheetOpen}
        onClose={() => setAssetSheetOpen(false)}
        onSelect={(id) => {
          setSelectedAsset(id as AssetSymbol)
          setAssetSheetOpen(false)
        }}
        options={ASSET_LIST.map((asset) => ({
          id: asset.symbol,
          label: asset.name,
          description: asset.symbol,
          icon: <AssetIcon symbol={asset.symbol} size={32} />,
        }))}
        selected={selectedAsset}
        title="Select Asset"
      />

      {/* Network Selection Sheet */}
      <SelectSheet
        isOpen={networkSheetOpen}
        onClose={() => setNetworkSheetOpen(false)}
        onSelect={(id) => {
          setSelectedNetwork(id)
          setNetworkSheetOpen(false)
        }}
        options={TRANSFER_METHOD_OPTIONS.map((method) => ({
          id: method,
          label: TRANSFER_METHOD_LABELS[method],
        }))}
        selected={selectedNetwork || undefined}
        title="Select Network"
      />
    </>
  )
}
