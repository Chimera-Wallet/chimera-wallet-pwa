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
    description: 'ark_network_selector_descr',
    icon: '/images/icons/network-ark.svg',
    addressPlaceholder: 'ark_address_placeholder',
  },
  [TRANSFER_METHOD.lightning]: {
    id: TRANSFER_METHOD.lightning,
    name: 'Lightning',
    description: 'lightning_network_selector_descr',
    icon: '/images/icons/network-lightning.svg',
    addressPlaceholder: 'lightning_address_placeholder',
  },
  [TRANSFER_METHOD.bitcoin]: {
    id: TRANSFER_METHOD.bitcoin,
    name: 'Native Chain',
    description: 'bitcoin_network_selector_descr',
    icon: '/images/icons/network-bitcoin.svg',
    addressPlaceholder: 'bitcoin_address_placeholder',
  },
  [TRANSFER_METHOD.bank]: {
    id: TRANSFER_METHOD.bank,
    name: 'Bank Transfer',
    description: 'bank_network_selector_descr',
    icon: '/images/icons/network-bank.svg',
    addressPlaceholder: 'bank_address_placeholder',
  },
} as const

// List of networks for send functionality
export const SEND_NETWORK_LIST: NetworkConfig[] = [
  NETWORKS[TRANSFER_METHOD.ark],
  NETWORKS[TRANSFER_METHOD.bitcoin],
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
