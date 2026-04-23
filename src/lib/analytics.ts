import { track } from '@plausible-analytics/tracker'

export const trackPageView = (pageName: string): void => {
  try {
    track('pageview', { url: `${window.location.origin}/${pageName}` })
  } catch (err) {
    console.error('Analytics tracking error:', err)
  }
}

export const trackEvent = (eventName: string, props?: Record<string, string>): void => {
  try {
    track(eventName, { props })
  } catch (err) {
    console.error('Analytics event tracking error:', err)
  }
}
