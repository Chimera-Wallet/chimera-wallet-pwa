import { IonHeader, IonTitle } from '@ionic/react'
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
  text: string
}

export default function Header({ auxAriaLabel, auxFunc, auxText, back, text, auxIcon, heading = true }: HeaderProps) {
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
    <IonHeader style={{ boxShadow: 'none' }}>
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
        <IonTitle
          className='ion-text-center'
          style={
            heading ? { fontFamily: 'var(--heading-font)', letterSpacing: '-0.5px', fontWeight: '500' } : undefined
          }
        >
          {text}
        </IonTitle>
        <div style={style} onClick={auxFunc} aria-label={auxAriaLabel}>
          {auxText || auxIcon ? (
            <Focusable onEnter={auxFunc} fit round>
              {auxText ? SideButton(auxText) : <div style={{ padding: '0.5rem' }}>{auxIcon}</div>}
            </Focusable>
          ) : (
            '\u00A0'
          )}
        </div>
      </FlexRow>
    </IonHeader>
  )
}
