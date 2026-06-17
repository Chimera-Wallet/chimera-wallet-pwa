import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { EASE_OUT_QUINT_TUPLE } from '../lib/animations'

interface TxResultState {
  open: boolean
  success: boolean
  message?: string
  detail?: string
}

interface TxResultContextProps {
  // Show a blocking success/fail popup that auto-dismisses. The returned promise
  // resolves once the popup has been shown for `durationMs`, so callers can run
  // follow-up logic (e.g. navigate home) right after.
  notifyResult: (success: boolean, message?: string, detail?: string, durationMs?: number) => Promise<void>
}

export const TxResultContext = createContext<TxResultContextProps>({
  notifyResult: async () => {},
})

const DEFAULT_DURATION = 2000

export function TxResultProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TxResultState>({ open: false, success: true })
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => timer.current && clearTimeout(timer.current), [])

  const notifyResult = useCallback(
    (success: boolean, message?: string, detail?: string, durationMs = DEFAULT_DURATION) => {
      return new Promise<void>((resolve) => {
        if (timer.current) clearTimeout(timer.current)
        setState({ open: true, success, message, detail })
        timer.current = setTimeout(() => {
          setState((s) => ({ ...s, open: false }))
          resolve()
        }, durationMs)
      })
    },
    [],
  )

  return (
    <TxResultContext.Provider value={{ notifyResult }}>
      {children}
      <TxResultPopup open={state.open} success={state.success} message={state.message} detail={state.detail} />
    </TxResultContext.Provider>
  )
}

export const useTxResult = () => useContext(TxResultContext)

function TxResultPopup({ open, success, message, detail }: TxResultState) {
  const text = message ?? (success ? 'Success' : 'Failed')
  return (
    <AnimatePresence>
      {open ? (
        <>
          {/* Full-screen scrim — blocks all interaction with the screen behind.
              Intentionally has no onClick handler so the popup can't be dismissed early. */}
          <motion.div
            key='txresult-scrim'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT_QUINT_TUPLE }}
            style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          />
          <motion.div
            key='txresult-card'
            role='alertdialog'
            aria-live='assertive'
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ duration: 0.3, ease: EASE_OUT_QUINT_TUPLE }}
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1001,
              display: 'flex',
              justifyContent: 'center',
              padding: '1rem',
              paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '640px',
                background: 'var(--background-color)',
                border: '1px solid var(--neutral-100)',
                borderRadius: '1rem',
                padding: '2rem 1.5rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              {success ? <SuccessMark /> : <FailMark />}
              <p
                style={{
                  margin: 0,
                  fontWeight: 600,
                  fontSize: '1.1rem',
                  textAlign: 'center',
                  color: 'var(--text-color)',
                }}
              >
                {text}
              </p>
              {detail ? (
                <p style={{ margin: 0, fontSize: '0.9rem', textAlign: 'center', color: 'var(--neutral-700)' }}>
                  {detail}
                </p>
              ) : null}
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  )
}

function SuccessMark() {
  return (
    <svg width='56' height='56' viewBox='0 0 56 56' fill='none' xmlns='http://www.w3.org/2000/svg'>
      <circle cx='28' cy='28' r='28' fill='var(--green)' />
      <path
        d='M17 28.5L24.5 36L39 21.5'
        stroke='var(--white)'
        strokeWidth='4'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  )
}

function FailMark() {
  return (
    <svg width='56' height='56' viewBox='0 0 56 56' fill='none' xmlns='http://www.w3.org/2000/svg'>
      <path
        d='M28 5L53 49H3L28 5Z'
        fill='var(--red)'
        stroke='var(--red)'
        strokeWidth='3'
        strokeLinejoin='round'
      />
      <path d='M28 22V34' stroke='var(--white)' strokeWidth='4' strokeLinecap='round' />
      <circle cx='28' cy='41.5' r='2.5' fill='var(--white)' />
    </svg>
  )
}
