export const deepLinkInUrl = (): { appId: string; query: string } | undefined => {
  const clean = window.location.hash.slice(1)

  // Expected format: app+{app_id}?{query_params}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, afterApp] = clean.split('app+', 2)
  if (!afterApp) return undefined
  const [appId, query] = afterApp.split('?', 2)
  if (!appId) return undefined
  return { appId, query }
}

/**
 * Clear the deep link from the URL after processing
 */
export const clearDeepLinkFromUrl = (): void => {
  if (window.location.hash) {
    window.history.replaceState({}, '', window.location.pathname)
  }
}
