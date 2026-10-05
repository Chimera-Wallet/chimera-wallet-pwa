import { useState } from 'react'
import { canBrowserShareData, shareData } from '../lib/share'
import { consoleError } from '../lib/logs'

interface ShareContent {
  title: string
  text: string
}

/**
 * The system share sheet, guarded against double taps. `canShare` is false
 * while a share is open or when the browser can't share this content.
 */
export function useShare() {
  const [sharing, setSharing] = useState(false)

  const canShare = (content: ShareContent) => !sharing && canBrowserShareData(content)

  const share = (content: ShareContent) => {
    setSharing(true)
    shareData(content)
      .catch(consoleError)
      .finally(() => setSharing(false))
  }

  return { canShare, share }
}
