import { testDomains } from './constants'

export interface AppInfoSlide {
  title: string
  description: string
  image: string
}

export interface AppTerms {
  title: string
  content: string
  checkboxLabel: string
}

export interface AppConfig {
  id: string
  name: string
  description: string
  icon: string
  live: boolean
  // Optional info slides to show before opening the app
  infoSlides?: AppInfoSlide[]
  // Optional terms and conditions
  terms?: AppTerms
  // URL configuration - can have different URLs for different environments
  urls: {
    production: string
    staging?: string
    development?: string
  }
}

/**
 * Determines if we're in a staging/test environment based on hostname
 */
export const isTestEnvironment = (): boolean => {
  for (const domain of testDomains) {
    if (window.location.hostname.includes(domain)) {
      return true
    }
  }
  return false
}

/**
 * Gets the appropriate URL for an app based on the current environment
 */
export const getAppUrl = (config: AppConfig): string => {
  const isTest = isTestEnvironment()
  const isLocalhost = window.location.hostname.includes('localhost')

  // Check for environment variable override first
  const envVarName = `VITE_${config.id.toUpperCase().replace(/-/g, '_')}_URL`
  const envUrl = (import.meta.env as Record<string, string | undefined>)[envVarName]
  if (envUrl) return envUrl

  // Otherwise use configured URLs based on environment
  if (isLocalhost && config.urls.development) {
    return config.urls.development
  }
  if (isTest && config.urls.staging) {
    return config.urls.staging
  }
  return config.urls.production
}

// App configurations
export const appConfigs: Record<string, AppConfig> = {
  statement: {
    id: 'statement',
    name: 'Statement',
    description: 'View your transaction history and account statements',
    icon: 'statement',
    live: true,
    infoSlides: [
      {
        title: 'Your Financial Overview',
        description:
          'Access detailed statements of all your transactions, balances, and account activity in one place.',
        image: '/images/apps/statement.png',
      },
    ],
    urls: {
      production: '',
      staging: '',
    },
  },
  referral: {
    id: 'referral',
    name: 'Referral',
    description: 'Invite friends and earn rewards',
    icon: 'referral',
    live: true,
    infoSlides: [
      {
        title: 'What is the Referral Program?',
        description:
          "You're at the centre, and the rewards are endless!\n\nEarn 20% of all fees from every friend who signs up with your link—forever.\nNo caps,no limits, no expiration; just continuous rewards. The more you share, the more you earn. Ready?\n\nCopy your link, spread the word, and let the rewards roll in!",
        image: '/rocket.png',
      },
    ],
    urls: {
      production: '',
      staging: '',
    },
  },
  'gift-cards': {
    id: 'gift-cards',
    name: 'Gift Cards',
    description: 'Buy and redeem gift cards with Bitcoin',
    icon: 'gift-cards',
    live: true,
    urls: {
      production: 'https://giftcards.chimerawallet.com/gift-cards/',
      staging: 'https://app.staging.chimerawallet.com/gift-cards/',
      development: 'https://app.staging.chimerawallet.com/gift-cards/',
    },
  },
  'card-reservation': {
    id: 'card-reservation',
    name: 'Card Reservation',
    description: 'Reserve your Chimera debit card',
    icon: 'card-reservation',
    live: true,
    infoSlides: [],
    urls: {
      production: 'https://chimerawallet.com/card?embed=1',
      // No staging URL for card reservation
    },
  },
}

export const getAppConfig = (appId: string): AppConfig | undefined => {
  return appConfigs[appId]
}
