import { Toaster, toast } from 'sonner'
import './Toast.css'

export { toast }

export const useToast = () => ({ toast })

// Sonner anchors a top-positioned toaster at a flat `top: var(--offset-top)`
// (24px desktop / 16px mobile), which on an iPhone puts it *under* the Dynamic
// Island — the toast renders behind the cutout instead of below it. Offset by
// the safe-area inset so the toast always clears the island/notch. Only `top`
// is overridden; the other sides keep sonner's defaults.
const SAFE_TOP_OFFSET = 'calc(env(safe-area-inset-top, 0px) + 16px)'

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        visibleToasts={1}
        className='arkade-toast-toaster'
        position='top-center'
        richColors
        offset={{ top: SAFE_TOP_OFFSET }}
        mobileOffset={{ top: SAFE_TOP_OFFSET }}
        toastOptions={{
          classNames: {
            content: 'arkade-toast-content',
          },
          style: {
            background: 'var(--toast-bg, #1a1a1a)',
            color: 'var(--toast-color, #fafafa)',
            border: 'none',
            borderRadius: '12px',
            padding: '14px 20px',
            fontSize: '15px',
            fontWeight: 500,
            textAlign: 'center' as const,
            letterSpacing: '-0.01em',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.12)',
          },
          duration: 2000,
        }}
      />
    </>
  )
}
