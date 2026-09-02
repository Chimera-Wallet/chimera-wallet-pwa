import { useState } from 'react'
import { TRANSFER_METHOD, type TransferMethod } from '../lib/transferMethods'
import { SEND_NETWORK_LIST, getNetworkConfig } from '../lib/networks'
import { ASSETS, assetSupportsBankTransfer } from '../lib/assets'
import NetworkIcon from '../icons/NetworkIcon'
import SelectSheet from './SelectSheet'
import SelectorField from './SelectorField'
import {useTranslation} from 'react-i18next'

interface NetworkSelectorProps {
  /** Asset the transfer is for; decides whether bank transfer is offered. */
  assetSymbol?: string
  label?: string
  onSelect: (network: TransferMethod) => void
  selected: TransferMethod | undefined
  isOpen?: boolean
  setIsOpen?: (isOpen: boolean) => void
  style ?: React.CSSProperties
}

export default function NetworkSelector({
  assetSymbol = ASSETS.BTC.symbol,
  label,
  onSelect,
  selected,
  isOpen: externalIsOpen,
  setIsOpen: externalSetIsOpen,
  style
}: NetworkSelectorProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false)

  // Use external state if provided, otherwise use internal state
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen
  const setIsOpen = externalSetIsOpen || setInternalIsOpen
  const { t } = useTranslation()

  const selectedConfig = selected ? getNetworkConfig(selected) : undefined
  const showBank = assetSupportsBankTransfer(assetSymbol)
  const options = SEND_NETWORK_LIST.filter(
    (network) => network.id !== TRANSFER_METHOD.bank || showBank,
  ).map((network) => ({
    id: network.id,
    label: t(network.name),
    description: t(network.description),
    icon: <NetworkIcon network={network.id} size={24} />,
  }))

  return (
    <>
      <SelectorField
        icon={selected ? <NetworkIcon network={selected} size={40} /> : undefined}
        label={label !== undefined ? label : 'Network'}
        onClick={() => setIsOpen(true)}
        value={selectedConfig?.name || selected || t('networks.select')}
        sublabel={t(selectedConfig?.description ?? 'placeholders.addressFallback')}
        style = {style}
      />
      <SelectSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSelect={(id) => onSelect(id as TransferMethod)}
        options={options}
        selected={selected}
        title={t('networks.select')}
      />
    </>
  )
}
