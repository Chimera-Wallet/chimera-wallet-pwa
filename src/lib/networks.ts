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
    description: 'Instant, low-fee Bitcoin transfers',
    icon: '/images/icons/network-ark.svg',
    addressPlaceholder: 'Paste Arkade address',
  },
  [TRANSFER_METHOD.lightning]: {
    id: TRANSFER_METHOD.lightning,
    name: 'Lightning',
    description: 'Fast Lightning Network payments',
    icon: '/images/icons/network-lightning.svg',
    addressPlaceholder: 'Paste Lightning invoice address',
  },
  [TRANSFER_METHOD.bitcoin]: {
    id: TRANSFER_METHOD.bitcoin,
    name: 'Native Chain',
    description: 'Bitcoin on-chain transactions',
    icon: '/images/icons/network-bitcoin.svg',
    addressPlaceholder: 'Paste BTC address',
  },
  [TRANSFER_METHOD.bank]: {
    id: TRANSFER_METHOD.bank,
    name: 'Bank Transfer',
    description: 'Traditional bank transfers',
    icon: '/images/icons/network-bank.svg',
    addressPlaceholder: 'Enter bank details',
  },
} as const

// List of networks for send functionality
export const SEND_NETWORK_LIST: NetworkConfig[] = [
  NETWORKS[TRANSFER_METHOD.ark],
  NETWORKS[TRANSFER_METHOD.lightning],
  NETWORKS[TRANSFER_METHOD.bitcoin],
  NETWORKS[TRANSFER_METHOD.bank],
]

// Full list including bank
export const ALL_NETWORK_LIST: NetworkConfig[] = Object.values(NETWORKS)

export const getNetworkConfig = (id: TransferMethod): NetworkConfig | undefined => {
  return NETWORKS[id]
}
