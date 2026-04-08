import Intercom, { show, showMessages, hide, shutdown, update } from '@intercom/messenger-js-sdk'

export interface IntercomConfig {
  app_id: string,
  hide_default_launcher: boolean
}

export const getIntercomConfig = (): IntercomConfig => {
  return {
    app_id: 'a7pgvcoj',
    hide_default_launcher: true
  }
}

let isIntercomReady = false

export const initializeIntercom = (): void => {
  const config = getIntercomConfig()
  
  if (!config.app_id) {
    console.warn('Intercom app_id is not configured')
    return
  }

  Intercom(config)
  
  // Mark as ready after a short delay to ensure SDK is fully initialized
  // This is especially important on iOS Safari
  setTimeout(() => {
    isIntercomReady = true
  }, 1000)
}

export const showIntercom = (): void => {
  // If Intercom isn't ready yet, wait and retry
  if (!isIntercomReady) {
    console.log('Intercom not ready yet, waiting...')
    setTimeout(() => {
      showIntercom()
    }, 500)
    return
  }
  
  try {
    showMessages()
  } catch (error) {
    console.error('Failed to show Intercom messenger:', error)
    // Fallback: try using show() instead
    try {
      show()
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError)
    }
  }
}

export const hideIntercom = (): void => {
  hide()
}

export const shutdownIntercom = (): void => {
  shutdown()
  isIntercomReady = false
}

export const updateIntercomUser = (user: { name?: string; email?: string; user_id?: string }): void => {
  update(user)
}
