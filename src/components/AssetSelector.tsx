import { useState } from 'react'
import { ASSET_LIST, type AssetSymbol, getAssetConfig } from '../lib/assets'
import AssetIcon from '../icons/AssetIcon'
import SelectSheet from './SelectSheet'
import SelectorField from './SelectorField'
import {fromSatoshis} from '../lib/format'

interface AssetSelectorProps {
  label?: string
  onSelect: (symbol: AssetSymbol) => void
  selected: AssetSymbol
  isOpen?: boolean
  setIsOpen?: (isOpen: boolean) => void
  selectedBalance ?: number
  style ?: React.CSSProperties
  showValue ?: boolean
}

export default function AssetSelector({
  label,
  onSelect,
  selected,
  isOpen: externalIsOpen,
  setIsOpen: externalSetIsOpen,
  selectedBalance,
  style,
  showValue
}: AssetSelectorProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false)

  // Use external state if provided, otherwise use internal state
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen
  const setIsOpen = externalSetIsOpen || setInternalIsOpen

  const selectedConfig = getAssetConfig(selected)
  const options = ASSET_LIST.filter((asset) => !asset.comingSoon).map((asset) => ({
    id: asset.symbol,
    label: asset.name,
    description: asset.symbol,
    icon: <AssetIcon symbol={asset.symbol} size={32} />,
  }))
  const selectedBalanceLabel =
  selectedBalance !== undefined
    ? `${selectedConfig?.name} - ${fromSatoshis(selectedBalance)} BTC`
    : selected

  return (
    <>
      <SelectorField
        icon={<AssetIcon symbol={selected} size={20} />}
        label={label !== undefined ? label : 'Asset'}        
        onClick={() => setIsOpen(true)}
        value={selectedConfig?.name || selected}
        sublabel={selectedBalanceLabel}
        style = {style}
        showValue = {showValue}
      />
      <SelectSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSelect={(id) => onSelect(id as AssetSymbol)}
        options={options}
        selected={selected}
        title='Select Asset'
      />
    </>
  )
}
