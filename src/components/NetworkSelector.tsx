import { useState } from 'react'
import type { TransferMethod } from '../lib/transferMethods'
import { SEND_NETWORK_LIST, getNetworkConfig } from '../lib/networks'
import NetworkIcon from '../icons/NetworkIcon'
import SelectSheet from './SelectSheet'
import SelectorField from './SelectorField'

interface NetworkSelectorProps {
  label?: string
  onSelect: (network: TransferMethod) => void
  selected: TransferMethod | undefined
  isOpen?: boolean
  setIsOpen?: (isOpen: boolean) => void
}

export default function NetworkSelector({ label, onSelect, selected, isOpen: externalIsOpen, setIsOpen: externalSetIsOpen }: NetworkSelectorProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false)
  
  // Use external state if provided, otherwise use internal state
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen
  const setIsOpen = externalSetIsOpen || setInternalIsOpen

  const selectedConfig = selected ? getNetworkConfig(selected) : undefined
  const options = SEND_NETWORK_LIST.map((network) => ({
    id: network.id,
    label: network.name,
    description: network.description,
    icon: <NetworkIcon network={network.id} size={24} />,
  }))

  return (
    <>
      <SelectorField
        icon={selected ? <NetworkIcon network={selected} size={24} /> : undefined}
        label={label || 'Network'}
        onClick={() => setIsOpen(true)}
        value={selectedConfig?.name || selected || 'Select network'}
        sublabel={selectedConfig?.description}
      />
      <SelectSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSelect={(id) => onSelect(id as TransferMethod)}
        options={options}
        selected={selected}
        title="Select Network"
      />
    </>
  )
}
