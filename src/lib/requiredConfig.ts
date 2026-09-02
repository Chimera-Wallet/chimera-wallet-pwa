// Startup validation for required deployment configuration.
//
// Some configuration is mandatory for the wallet to function (a resolvable
// Arkade server, the Arkade Wrap API, and an asset id for each wrapped asset the
// build actually offers). If any of these are missing the app must fail loudly
// at boot rather than silently degrading (e.g. showing 0 balances). Missing
// config is a deployment error, so we block the app and log clearly instead of
// letting the user continue.
//
// What is "required" depends on which assets are switched on: an asset that is
// hidden or still "coming soon" cannot be held or moved, so demanding its id
// only blocks deployments over config for a feature nobody can reach.

import { consoleError } from './logs'
import { getRequiredAssetIdEnvVars } from './assets'

// Env vars that must be present and non-empty regardless of which assets are
// enabled. The per-asset `VITE_ARKADE_*` ids are NOT listed here — they depend
// on what this build actually offers and come from getRequiredAssetIdEnvVars().
const REQUIRED_ENV_VARS = ['VITE_ARK_SERVER', 'VITE_ARKADEWRAP_API'] as const

/** Names of required configuration that is missing or empty. Empty when valid. */
export const getMissingRequiredConfig = (): string[] => {
  const env = import.meta.env as Record<string, string | undefined>
  const required: string[] = [...REQUIRED_ENV_VARS, ...getRequiredAssetIdEnvVars()]
  const missing: string[] = required.filter((key) => !env[key] || env[key]!.trim() === '')
  // Delegation must be explicitly enabled or disabled — no default is allowed.
  const delegate = env.VITE_DELEGATE_ENABLED
  if (delegate !== 'true' && delegate !== 'false') {
    missing.push('VITE_DELEGATE_ENABLED')
  } else if (delegate === 'true' && (!env.VITE_DELEGATOR_URL || env.VITE_DELEGATOR_URL.trim() === '')) {
    // A delegator URL is mandatory only when delegation is enabled.
    missing.push('VITE_DELEGATOR_URL')
  }
  return missing
}

let alreadyLogged = false

/** Log the missing configuration once, with a clear message. */
export const logMissingRequiredConfig = (missing: string[]): void => {
  if (alreadyLogged || missing.length === 0) return
  alreadyLogged = true
  consoleError(
    new Error(`Missing required configuration: ${missing.join(', ')}`),
    'Startup configuration check failed',
  )
}
