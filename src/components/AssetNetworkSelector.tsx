import { useState } from 'react'
import SelectSheet from './SelectSheet'
import SelectorField from './SelectorField'
import NetworkIcon from '../icons/NetworkIcon'
import { TRANSFER_METHOD } from '../lib/transferMethods'
import { requireNetworkConfig } from '../lib/networks'
import { getSourceChains, requireSourceChain, type SourceChainId } from '../lib/sourceChains'
import { useTranslation } from 'react-i18next'

// A network choice is either one of the base transfer methods (Arkade / bank)
// or a native source chain handled by the Arkade Wrap bridge.
export type AssetNetworkChoice = 'ark' | 'bank' | SourceChainId

interface Option {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
}

const ChainIcon = ({ src, size = 24 }: { src: string; size?: number }) => (
  <img src={src} alt='' width={size} height={size} style={{ display: 'block', borderRadius: '50%' }} />
)

const buildOptions = (assetSymbol: string, mode: 'receive' | 'send'): Option[] => {
  const bank = requireNetworkConfig(TRANSFER_METHOD.bank)
  const{t} = useTranslation()
  const options: Option[] = [
    {
      id: TRANSFER_METHOD.ark,
      label: 'Arkade',
      description: mode === 'receive' ? t('components.assetNet.rcvArk') : t('components.assetNet.sendArk'),
      icon: <NetworkIcon network={TRANSFER_METHOD.ark} size={24} />,
    },
  ]
  for (const { chain } of getSourceChains(assetSymbol)) {
    options.push({
      id: chain.id,
      label: chain.name,
      description: mode === 'receive' ? t('components.assetNet.depFrom',{name: chain.name}) : t('components.assetNet.withdrawTo', {name: chain.name}),
      icon: <ChainIcon src={chain.icon} />,
    })
  }
  options.push({
    id: TRANSFER_METHOD.bank,
    label: bank.name,
    description: bank.description,
    icon: <NetworkIcon network={TRANSFER_METHOD.bank} size={24} />,
  })
  return options
}

const labelFor = (id: string): { label: string; description?: string; icon: React.ReactNode } => {
  const {t} = useTranslation()
  if (id === TRANSFER_METHOD.ark) {
    return { label: 'Arkade', description: t('components.assetNet.arkNet') , icon: <NetworkIcon network={TRANSFER_METHOD.ark} size={40} /> }
  }
  if (id === TRANSFER_METHOD.bank) {
    const bank = requireNetworkConfig(TRANSFER_METHOD.bank)
    return { label: bank.name, description: bank.description, icon: <NetworkIcon network={TRANSFER_METHOD.bank} size={40} /> }
  }
  const chain = requireSourceChain(id as SourceChainId)
  return { label: chain.name, description: chain.name, icon: <ChainIcon src={chain.icon} size={40} /> }
}

interface AssetNetworkSelectorProps {
  assetSymbol: string
  mode: 'receive' | 'send'
  selected: AssetNetworkChoice | undefined
  onSelect: (choice: AssetNetworkChoice) => void
  label?: string
  style?: React.CSSProperties
  isOpen?: boolean
  setIsOpen?: (isOpen: boolean) => void
}

export default function AssetNetworkSelector({
  assetSymbol,
  mode,
  selected,
  onSelect,
  label,
  style,
  isOpen: externalIsOpen,
  setIsOpen: externalSetIsOpen,
}: AssetNetworkSelectorProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false)
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen
  const setIsOpen = externalSetIsOpen || setInternalIsOpen
  const options = buildOptions(assetSymbol, mode)
  const current = selected ? labelFor(selected) : undefined
  const {t} = useTranslation()

  return (
    <>
      <SelectorField
        icon={current?.icon}
        label={label !== undefined ? label : t('components.assetNet.net')}
        onClick={() => setIsOpen(true)}
        value={current?.label ?? t('components.assetNet.select')}
        sublabel={current?.description}
        style={style}
      />
      <SelectSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSelect={(id) => onSelect(id as AssetNetworkChoice)}
        options={options}
        selected={selected}
        title={t('components.assetNet.select')}
      />
    </>
  )
}
