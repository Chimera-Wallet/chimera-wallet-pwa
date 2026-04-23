import Intercom, { show, showMessages, hide, shutdown, update } from '@intercom/messenger-js-sdk'

// Extend Window interface for native Intercom API
declare global {
  interface Window {
    Intercom?: (...args: any[]) => void
  }
}

export interface IntercomConfig {
  app_id: string
  hide_default_launcher: boolean
}

export const getIntercomConfig = (): IntercomConfig => {
  return {
    app_id: 'a7pgvcoj',
    hide_default_launcher: true,
  }
}

export const initializeIntercom = (): void => {
  const config = getIntercomConfig()

  if (!config.app_id) {
    console.warn('Intercom app_id is not configured')
    return
  }

  try {
    // Initialize using the SDK
    Intercom(config)

    // Also set up the native window.Intercom if not already present
    // This provides a fallback for iOS
    if (typeof window.Intercom !== 'function') {
      console.log('Setting up native Intercom fallback')
    }
  } catch (error) {
    console.error('Failed to initialize Intercom SDK:', error)

    // Try to initialize using native API as fallback
    if (typeof window.Intercom === 'function') {
      try {
        window.Intercom('boot', config)
      } catch (fallbackError) {
        console.error('Fallback boot also failed:', fallbackError)
      }
    }
  }
}

export const showIntercom = (): void => {
  // On iOS, we must call this SYNCHRONOUSLY within the click handler
  // to maintain user interaction context. No setTimeout or async operations.

  console.log('Attempting to show Intercom messenger...')

  try {
    // Try the SDK method first
    showMessages()
    console.log('Successfully called showMessages()')
    return
  } catch (error) {
    console.warn('SDK showMessages failed:', error)
  }

  try {
    // Fallback to SDK show() method
    show()
    console.log('Successfully called show()')
    return
  } catch (error) {
    console.warn('SDK show failed:', error)
  }

  // Final fallback: use native window.Intercom API if available
  if (typeof window.Intercom === 'function') {
    try {
      window.Intercom('show')
      console.log('Successfully called window.Intercom(show)')
      return
    } catch (error) {
      console.error('Native Intercom API show failed:', error)
    }

    // Try showMessages via native API
    try {
      window.Intercom('showMessages')
      console.log('Successfully called window.Intercom(showMessages)')
      return
    } catch (error) {
      console.error('Native Intercom API showMessages failed:', error)
    }
  } else {
    console.error('window.Intercom is not available')
  }

  console.error('All Intercom methods failed to open messenger')
}

export const hideIntercom = (): void => {
  try {
    hide()
  } catch (error) {
    if (typeof window.Intercom === 'function') {
      window.Intercom('hide')
    }
  }
}

export const shutdownIntercom = (): void => {
  try {
    shutdown()
  } catch (error) {
    if (typeof window.Intercom === 'function') {
      window.Intercom('shutdown')
    }
  }
}

export const updateIntercomUser = (user: { name?: string; email?: string; user_id?: string }): void => {
  try {
    update(user)
  } catch (error) {
    if (typeof window.Intercom === 'function') {
      window.Intercom('update', user)
    }
  }
}
