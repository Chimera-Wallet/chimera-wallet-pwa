import { Delegate } from './types'

export const arknoteHRP = 'arknote'
export const defaultFee = 0
export const defaultPassword = 'noah'
export const minSatsToNudge = 100_000
export const maxPercentage = import.meta.env.VITE_MAX_PERCENTAGE ?? 10
export const psaMessage = import.meta.env.VITE_PSA_MESSAGE ?? ''
export const enableChainSwapsReceive = import.meta.env.VITE_CHAIN_SWAPS_RECEIVE_ENABLED === 'true'
export const lnurlServerUrl: string | undefined = import.meta.env.VITE_LNURL_SERVER_URL

// Hostnames used to detect a non-production (test/staging) deployment when
// selecting environment-specific app and KYC URLs. These are Chimera app hosts,
// not ARK server endpoints, so there is no network fallback here.
export const testDomains = ['dev.arkade.money', 'next.arkade.money', 'pages.dev', 'localhost']

// The Arkade server is resolved exclusively from the environment. There is no
// fallback: if VITE_ARK_SERVER is not configured we throw so the app fails to
// start instead of silently connecting to the wrong network.
export const defaultArkServer = (): string => {
  const url = import.meta.env.VITE_ARK_SERVER
  if (!url || url.trim() === '') {
    throw new Error('VITE_ARK_SERVER is not configured')
  }
  return url
}

// Delegation is active only when the deployment enabled it and provided a
// delegator URL. A stale user toggle can never turn it on without config.
export const isDelegationEnabled = (): boolean =>
  import.meta.env.VITE_DELEGATE_ENABLED === 'true' &&
  !!import.meta.env.VITE_DELEGATOR_URL &&
  import.meta.env.VITE_DELEGATOR_URL.trim() !== ''

// The delegator service URL is resolved exclusively from the environment. There
// is no fallback: if VITE_DELEGATOR_URL is not configured we throw so delegation
// can never silently target the wrong endpoint.
export const getDelegateUrl = (): Delegate => {
  const url = import.meta.env.VITE_DELEGATOR_URL
  if (!url || url.trim() === '') {
    throw new Error('VITE_DELEGATOR_URL is not configured')
  }
  return {
    url,
    fee: 0,
    pubkey: '', // Placeholder, as the actual pubkey should be fetched from the delegate server
    address: '', // Placeholder, as the actual address should be fetched from the delegate server
    name: 'Arkade Default',
  }
}
