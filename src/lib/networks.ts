// Network configuration for use throughout the application
// This follows the same pattern as assets.ts for DRY principles

import { TRANSFER_METHOD, type TransferMethod } from './transferMethods'

export interface NetworkConfig {
  id: TransferMethod
  name: string
  description: string
  icon: string // Icon path in public folder
  addressPlaceholder: string
}

export const NETWORKS: Record<TransferMethod, NetworkConfig> = {
  [TRANSFER_METHOD.ark]: {
    id: TRANSFER_METHOD.ark,
    name: 'Arkade',
    description: 'networks.arkade.description',
    icon: '/images/icons/network-ark.svg',
    addressPlaceholder: 'placeholders.arkade.address',
  },
  [TRANSFER_METHOD.lightning]: {
    id: TRANSFER_METHOD.lightning,
    name: 'Lightning',
    description: 'networks.lightning.description',
    icon: '/images/icons/network-lightning.svg',
    addressPlaceholder: 'placeholders.lightning.address',
  },
  [TRANSFER_METHOD.bitcoin]: {
    id: TRANSFER_METHOD.bitcoin,
    name: 'networks.bitcoin.onChain',
    description: 'networks.bitcoin.description',
    icon: '/images/icons/network-bitcoin.svg',
    addressPlaceholder: 'placeholders.bitcoin.address',
  },
  [TRANSFER_METHOD.bank]: {
    id: TRANSFER_METHOD.bank,
    name: 'networks.bank.bank',
    description: 'networks.bank.description',
    icon: '/images/icons/network-bank.svg',
    addressPlaceholder: 'placeholders.bank.details',
  },
} as const

// List of networks for send functionality
export const SEND_NETWORK_LIST: NetworkConfig[] = [
  NETWORKS[TRANSFER_METHOD.ark],
  NETWORKS[TRANSFER_METHOD.bitcoin],
  NETWORKS[TRANSFER_METHOD.lightning],
  NETWORKS[TRANSFER_METHOD.bank],

]

// Full list including bank
export const ALL_NETWORK_LIST: NetworkConfig[] = Object.values(NETWORKS)

export const getNetworkConfig = (id: TransferMethod): NetworkConfig | undefined => {
  return NETWORKS[id]
}

/** Like `getNetworkConfig` but throws a descriptive error if the id is not found. */
export const requireNetworkConfig = (id: TransferMethod): NetworkConfig => {
  const config = getNetworkConfig(id)
  if (!config) throw new Error(`Unknown network id: "${id}"`)
  return config
}
