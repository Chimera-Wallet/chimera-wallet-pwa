/**
 * Service Worker Update Manager
 * Handles checking for and applying service worker updates
 */

export const checkForServiceWorkerUpdate = async (): Promise<boolean> => {
  if (!('serviceWorker' in navigator)) {
    return false
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) {
      return false
    }

    // Force check for updates
    await registration.update()

    // Check if there's a waiting service worker
    if (registration.waiting) {
      console.log('New service worker waiting to activate')
      return true
    }

    // Check if there's a service worker installing
    if (registration.installing) {
      console.log('New service worker installing')
      return true
    }

    return false
  } catch (error) {
    console.error('Error checking for service worker update:', error)
    return false
  }
}

/**
 * Skip waiting and activate the new service worker immediately
 */
export const activateNewServiceWorker = async (): Promise<void> => {
  if (!('serviceWorker' in navigator)) {
    return
  }

  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration?.waiting) {
    return
  }

  // Tell the waiting service worker to skip waiting and become active
  registration.waiting.postMessage({ type: 'SKIP_WAITING' })

  // Wait for the new service worker to activate
  await new Promise<void>((resolve) => {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('New service worker activated')
      resolve()
    })
  })
}

/**
 * Setup periodic checks for service worker updates
 * @param intervalMinutes How often to check for updates (default: 60 minutes)
 */
export const setupPeriodicUpdateCheck = (intervalMinutes: number = 60): (() => void) => {
  const checkInterval = setInterval(
    async () => {
      console.log('Checking for service worker updates...')
      const hasUpdate = await checkForServiceWorkerUpdate()
      if (hasUpdate) {
        console.log('Service worker update available')
        // You could show a notification to the user here
        // For now, we'll auto-update on next full page reload
      }
    },
    intervalMinutes * 60 * 1000,
  )

  // Return cleanup function
  return () => clearInterval(checkInterval)
}
