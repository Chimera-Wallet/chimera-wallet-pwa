import { useState } from 'react'
import { ASSET_LIST, type AssetConfig, type AssetSymbol, getAssetConfig, getDisplayTicker } from '../lib/assets'
import AssetIcon from '../icons/AssetIcon'
import SelectSheet from './SelectSheet'
import SelectorField from './SelectorField'
import {fromSatoshis} from '../lib/format'
import { useTranslation } from 'react-i18next'

interface AssetSelectorProps {
  /** Assets to offer; defaults to every asset in the wallet. */
  assets?: AssetConfig[]
  label?: string
  onSelect: (symbol: AssetSymbol) => void
  selected: AssetSymbol
  isOpen?: boolean
  setIsOpen?: (isOpen: boolean) => void
  selectedBalance ?: number
  style ?: React.CSSProperties
  showValue ?: boolean
  iconSize ?: number
}

export default function AssetSelector({
  assets = ASSET_LIST,
  label,
  onSelect,
  selected,
  isOpen: externalIsOpen,
  setIsOpen: externalSetIsOpen,
  selectedBalance,
  style,
  showValue,
  iconSize = 20
}: AssetSelectorProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false)

  // Use external state if provided, otherwise use internal state
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen
  const setIsOpen = externalSetIsOpen || setInternalIsOpen

  const {t} = useTranslation()

  const selectedConfig = getAssetConfig(selected)
  const options = assets.filter((asset) => !asset.comingSoon).map((asset) => ({
    id: asset.symbol,
    label: asset.name,
    description: getDisplayTicker(asset.symbol),
    icon: <AssetIcon symbol={asset.symbol} size={32} />,
  }))
  const selectedBalanceLabel =
  selectedBalance !== undefined
    ? `${selectedConfig?.name} - ${fromSatoshis(selectedBalance)} BTC`
    : getDisplayTicker(selected)

  return (
    <>
      <SelectorField
        icon={<AssetIcon symbol={selected} size={iconSize} />}
        label={label !== undefined ? label : t('components.assetNet.ass')}        
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
        title={t('components.assetNet.selectAsset')}
      />
    </>
  )
}
