import { useCallback, useEffect, useRef, useState } from 'react'
import Modal from '../components/Modal'
import Text from '../components/Text'
import Button from '../components/Button'

export interface ApprovalRequest {
  title: string
  details: string
}

// Embedded apps (Satora, LendaSat) reach the wallet through the wallet bridge.
// Being allowed to talk to the bridge is permission to *ask*, never to send or
// sign: every such request waits here for the user, showing exactly what will
// be sent or signed (CertiK pentest CWP-03 found Satora sending with no prompt).
//
// Approve stays disabled for a moment after the prompt appears, so a click (or
// double-click) aimed at the embedded page can't land on it by accident.
const ARM_DELAY_MS = 1000

export function useBridgeApproval(appName: string) {
  const [request, setRequest] = useState<ApprovalRequest | null>(null)
  const [armed, setArmed] = useState(false)
  const resolver = useRef<((approved: boolean) => void) | null>(null)

  const requestApproval = useCallback(
    (next: ApprovalRequest): Promise<void> => {
      if (resolver.current) {
        return Promise.reject(new Error(`Another ${appName} request is awaiting approval`))
      }
      setArmed(false)
      setRequest(next)
      return new Promise((resolve, reject) => {
        resolver.current = (approved) => {
          resolver.current = null
          setRequest(null)
          if (approved) resolve()
          else reject(new Error('Request rejected'))
        }
      })
    },
    [appName],
  )

  const resolveApproval = useCallback((approved: boolean) => {
    resolver.current?.(approved)
  }, [])

  // Leaving the app rejects whatever is pending.
  useEffect(() => {
    return () => resolver.current?.(false)
  }, [])

  useEffect(() => {
    if (!request) return
    const timer = setTimeout(() => setArmed(true), ARM_DELAY_MS)
    return () => clearTimeout(timer)
  }, [request])

  const approvalModal = (
    <Modal open={Boolean(request)} onOpenChange={(open) => !open && resolveApproval(false)}>
      {request ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Text bold large wrap>
            {request.title}
          </Text>
          <Text small wrap>
            {request.details}
          </Text>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Button label='Reject' onClick={() => resolveApproval(false)} secondary style={{ flex: 1 }} />
            <Button label='Approve' onClick={() => resolveApproval(true)} disabled={!armed} style={{ flex: 1 }} />
          </div>
        </div>
      ) : null}
    </Modal>
  )

  return { requestApproval, approvalModal }
}
