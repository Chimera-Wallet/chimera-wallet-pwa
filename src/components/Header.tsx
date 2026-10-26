import React, { useContext } from 'react'
import { NavigationContext } from '../providers/navigation'
import BackIcon from '../icons/Back'
import SupportIcon from '../icons/Support'
import Shadow from './Shadow'
import Text from './Text'
import FlexRow from './FlexRow'
import Focusable from './Focusable'
import { hapticLight } from '../lib/haptics'
import { showIntercom } from '../lib/intercom'

const KNOWLEDGE_BASE_URL = 'https://support.chimerawallet.com'

interface HeaderProps {
  auxAriaLabel?: string
  auxFunc?: () => void
  auxText?: string
  auxIcon?: JSX.Element
  back?: (() => void) | boolean
  heading?: boolean
  /** Show the tips of the Chimera logo emerging from the top of the
   * screen in place of the title (home screen). `text` stays the accessible name. */
  logo?: boolean
  text: string
}

// The logo is 134x317. Its bottom quarter shows within the header, hanging from
// the top edge: just the blade tips, not the body above them. Sized so that
// quarter fills the header's 4rem; at 180px tall it read as "comically small".
const LOGO_HEIGHT = 256
const LOGO_WIDTH = Math.round((LOGO_HEIGHT * 134) / 317)
const LOGO_VISIBLE = Math.round(LOGO_HEIGHT / 4)

// On iPhone the page starts below the status bar / notch (`.page` sits at
// `top: env(safe-area-inset-top)`), so a logo cut off at the header's top edge
// hung under an empty band and looked smaller than on Android, where the
// browser draws the status bar outside the page. The clip window reaches up
// through that band so the logo grows from the screen's real top edge; where
// there's no inset (most Android) this changes nothing.
const SAFE_AREA_TOP = 'env(safe-area-inset-top, 0px)'

export default function Header({ auxAriaLabel, auxFunc, auxText, back, logo, text, auxIcon }: HeaderProps) {
  const { goBack } = useContext(NavigationContext)

  const handleBack = back
    ? () => {
        hapticLight()
        if (typeof back === 'function') back()
        else goBack()
      }
    : undefined

  const handleSupport = () => {
    hapticLight()

    // Try to show Intercom
    try {
      showIntercom()

      // On iOS, verify Intercom actually opened after a brief moment
      // If not, provide fallback to knowledge base
      const isIos =
        /iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

      if (isIos) {
        // Use requestAnimationFrame to check after next paint
        requestAnimationFrame(() => {
          setTimeout(() => {
            // Check if Intercom messenger is actually visible
            const intercomContainer = document.querySelector('#intercom-container')
            const intercomFrame = document.querySelector('iframe[name*="intercom"]')
            const isVisible =
              (intercomContainer || intercomFrame) &&
              ((intercomContainer && window.getComputedStyle(intercomContainer).display !== 'none') ||
                (intercomFrame && window.getComputedStyle(intercomFrame).display !== 'none'))

            if (!isVisible) {
              console.log('Intercom not available on iOS, opening knowledge base')
              window.open(KNOWLEDGE_BASE_URL, '_blank', 'noopener,noreferrer')
            }
          }, 1500)
        })
      }
    } catch (error) {
      console.error('Failed to show Intercom, opening knowledge base:', error)
      window.open(KNOWLEDGE_BASE_URL, '_blank', 'noopener,noreferrer')
    }
  }

  const SideButton = (text: string) => (
    <Shadow>
      <Text centered tiny wrap>
        {text}
      </Text>
    </Shadow>
  )

  const style: React.CSSProperties = {
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'flex-end',
    minWidth: '4rem',
    paddingRight: '1rem',
  }

  return (
    <div className='header' style={logo ? { position: 'relative' } : undefined}>
      {logo ? (
        <div
          aria-hidden='true'
          style={{
            position: 'absolute',
            top: `calc(-1 * ${SAFE_AREA_TOP})`,
            left: '50%',
            transform: 'translateX(-50%)',
            width: LOGO_WIDTH,
            height: `calc(${LOGO_VISIBLE}px + ${SAFE_AREA_TOP})`,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          {/* Anchored to the bottom, so the tips stay where they were and any
              extra height reveals more of the logo above them */}
          <img
            src='/images/chimera_logo_claw.png'
            alt=''
            style={{ position: 'absolute', bottom: 0, left: 0, display: 'block', width: LOGO_WIDTH, height: LOGO_HEIGHT }}
          />
        </div>
      ) : null}
      <FlexRow between>
        <div style={{ minWidth: '4rem', marginLeft: '0.5rem' }}>
          {handleBack ? (
            <Focusable onEnter={handleBack} fit round>
              <div onClick={handleBack} style={{ cursor: 'pointer' }} aria-label='Go back'>
                <BackIcon />
              </div>
            </Focusable>
          ) : (
            <Focusable onEnter={handleSupport} fit round>
              <div onClick={handleSupport} style={{ cursor: 'pointer' }} aria-label='Support / Knowledge Base'>
                <SupportIcon />
              </div>
            </Focusable>
          )}
        </div>
        {logo ? <h1 className='sr-only'>{text}</h1> : <p className='title'>{text}</p>}
        <div style={style} onClick={auxFunc} aria-label={auxAriaLabel} data-testid='header-aux-btn'>
          {auxText || auxIcon ? (
            <Focusable onEnter={auxFunc} fit round>
              {auxText ? SideButton(auxText) : <div style={{ padding: '0.5rem' }}>{auxIcon}</div>}
            </Focusable>
          ) : (
            '\u00A0'
          )}
        </div>
      </FlexRow>
    </div>
  )
}
