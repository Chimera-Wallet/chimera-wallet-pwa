// "Card details" bottom sheet: card number, expiry, CVV (each copyable) and
// cardholder, rendered by Wirex's PCI reveal SDK inside Wirex-served iframes.
// The values never reach this page: the frames fetch them from Wirex and the
// copy buttons run inside the frames. We only pass the card id, the tokens
// from createCardRevealSession and styling.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Info, X } from 'lucide-react'
import type { PciAppearance, PciEnvironment, PciRevealElement, PciRevealField } from '@wirexapp/card-reveal-web'
import SheetModal from '../../../components/SheetModal'
import ErrorMessage from '../../../components/Error'
import { TextSecondary } from '../../../components/Text'
import { useToast } from '../../../components/Toast'
import type { CardRevealSession, WirexCard } from '../../../lib/wirex'
import { errorText } from '../../../lib/wirexCard'

export interface CardDetailsSession extends CardRevealSession {
  /** Partner company id: the PCI SDK's `clientId` (selects our frame-ancestors allowlist). */
  clientId: string
  userAddress: string
}

interface CardDetailsSheetProps {
  card: WirexCard
  /** Open while set; cleared on close so the tokens are dropped. */
  session: CardDetailsSession | null
  onClose: () => void
}

/** Figma order. Cardholder comes from the (non-sensitive) card resource. */
const FIELDS: PciRevealField[] = ['number', 'expiry', 'cvv', 'cardholder']

/** The action token lives ~5 min; close a little before so the frames never sit on an expired one. */
const SESSION_TTL_MS = 4.5 * 60 * 1000

/** VITE_WIREX_SDK_ENV is dev | uat | prod, the same names the PCI SDK uses. */
const revealEnvironment = (): PciEnvironment => {
  const env = import.meta.env.VITE_WIREX_SDK_ENV
  return env === 'prod' || env === 'dev' ? env : 'uat'
}

// The frames can't read our CSS variables, so the Figma values are literal.
const APPEARANCE: PciAppearance = {
  theme: 'dark',
  variables: {
    surfaceColor: 'transparent',
    colorBackground: 'rgba(37, 37, 42, 1)', // --info-container-bg2
    colorBorder: 'transparent',
    borderWidth: '0px',
    borderRadius: '16px',
    controlMinHeight: '64px',
    fieldGap: '12px',
    colorText: '#ffffff',
    colorLabel: '#8a8a8f',
    colorCopyIcon: '#8a8a8f',
    colorCopyIconHover: '#ffffff',
    colorFocus: '#1f3bdb', // --blue-primary
    copyIconSize: '22px',
    fontFamily: 'Geist, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
    fontSizeBase: '15px',
    fontWeightBase: '600',
    fontSizeLabel: '10px',
    fontWeightLabel: '500',
    wordSpacing: '3px',
    fontSmoothing: 'antialiased',
  },
}

export default function CardDetailsSheet({ card, session, onClose }: CardDetailsSheetProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  // Callback-ref state: the drawer portals its content in after the first
  // render, so the container only exists once this is set.
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')

  // Mount the reveal frames for this session; destroy them on close/unmount.
  useEffect(() => {
    if (!container || !session) return
    let cancelled = false
    let reveal: PciRevealElement | undefined
    setStatus('loading')
    setError('')
    ;(async () => {
      // Lazy-loaded: only users who open card details download the SDK.
      const { createCardReveal } = await import('@wirexapp/card-reveal-web')
      if (cancelled) return
      reveal = createCardReveal(
        { environment: revealEnvironment(), clientId: session.clientId },
        {
          cardId: card.id,
          actionToken: session.actionToken,
          fetchDetails: true,
          fetchCvv: true,
          fields: FIELDS,
          cardholderName: card.card_data.name_on_card,
          auth: { getBearerToken: async () => session.accessToken, userWallet: session.userAddress },
          appearance: APPEARANCE,
          rowStyle: 'boxed',
          copy: 'button',
          copyByField: { cardholder: 'none' },
          onStateChange: (state) => {
            if (cancelled) return
            setStatus(state.status)
            if (state.status === 'error') setError(state.errorMessage ?? t('apps.wirexCard.cardDetails.error'))
          },
          onCopied: ({ field }) => toast(t(`apps.wirexCard.cardDetails.copied.${field}`)),
        },
      )
      await reveal.mount(container)
    })().catch((err) => {
      if (cancelled) return
      setStatus('error')
      setError(errorText(err))
    })
    return () => {
      cancelled = true
      reveal?.destroy()
    }
  }, [container, session, card.id, card.card_data.name_on_card, t, toast])

  // Don't leave card details on screen past the action token's lifetime.
  useEffect(() => {
    if (!session) return
    const timer = setTimeout(onClose, SESSION_TTL_MS)
    return () => clearTimeout(timer)
  }, [session, onClose])

  return (
    <SheetModal isOpen={Boolean(session)} onClose={onClose}>
      <div data-testid='wirex-card-details' style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.5rem' }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{t('apps.wirexCard.cardDetails.title')}</span>
          <button
            type='button'
            onClick={onClose}
            aria-label={t('apps.wirexCard.cardDetails.close')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--white)',
              padding: 4,
              cursor: 'pointer',
              display: 'flex',
            }}
          >
            <X size={22} />
          </button>
        </div>

        {status === 'loading' ? <TextSecondary>{t('apps.wirexCard.cardDetails.loading')}</TextSecondary> : null}
        <ErrorMessage error={status === 'error'} text={error} />

        {/* Wirex's iframes mount here and size themselves. */}
        <div ref={setContainer} data-testid='wirex-card-details-frame' style={{ width: '100%' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--grey)', fontSize: 11 }}>
          <Info size={14} style={{ flexShrink: 0 }} />
          <span>{t('apps.wirexCard.cardDetails.warning')}</span>
        </div>
      </div>
    </SheetModal>
  )
}
