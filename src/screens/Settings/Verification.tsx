import { useContext, useEffect, useState, useRef, useCallback } from 'react'
import { IonInput } from '@ionic/react'
import Header from './Header'
import Content from '../../components/Content'
import Padded from '../../components/Padded'
import FlexCol from '../../components/FlexCol'
import Text, { TextSecondary } from '../../components/Text'
import Loading from '../../components/Loading'
import Button from '../../components/Button'
import SuccessMessage from '../../components/Success'
import ErrorMessage from '../../components/Error'
import { FlowContext } from '../../providers/flow'
import { NavigationContext, Pages } from '../../providers/navigation'
import { OptionsContext } from '../../providers/options'
import {
  fetchKycStatus,
  getKycWebviewUrl,
  KycStatus,
  confirmMagicLink,
  saveKycTokens,
  saveKycStatus,
  saveKycEmail,
  getKycEmail,
} from '../../lib/kyc'
import { isIOS } from '../../lib/browser'

type ViewState = 'loading' | 'email' | 'registered' | 'webview' | 'status' | 'error'

// Timeout for iframe load detection (ms)
const IFRAME_LOAD_TIMEOUT = 8000

export default function Verification() {
  const { kycAuthParams, setKycAuthParams } = useContext(FlowContext)
  const { screen, goBack: navGoBack } = useContext(NavigationContext)
  const { goBack: optionsGoBack } = useContext(OptionsContext)

  // Determine back behavior based on how we got here
  // If we're on SettingsKYC page (standalone), use navigation history goBack
  // If we're within Settings page (via menu option), use OptionsContext goBack
  const isStandalonePage = screen === Pages.SettingsKYC
  const handleBack = isStandalonePage ? navGoBack : optionsGoBack

  const [viewState, setViewState] = useState<ViewState>('loading')
  const [kycStatus, setKycStatus] = useState<KycStatus>('not_started')
  const [statusMessage, setStatusMessage] = useState('')
  const [webviewUrl, setWebviewUrl] = useState('')
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [showIosFallback, setShowIosFallback] = useState(false)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Open KYC in external browser (iOS fallback)
  const openInExternalBrowser = useCallback(() => {
    const url = webviewUrl || getKycWebviewUrl()
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [webviewUrl])

  // Handle iframe load success
  const handleIframeLoad = useCallback(() => {
    setIframeLoaded(true)
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current)
      loadTimeoutRef.current = null
    }
  }, [])

  // Handle iframe load error
  const handleIframeError = useCallback(() => {
    if (isIOS()) {
      setShowIosFallback(true)
    }
  }, [])

  // On mount, determine what to show
  useEffect(() => {
    const initializeView = async () => {
      try {
        // If we have auth params from deep link, confirm them and show status
        if (kycAuthParams) {
          try {
            const tokens = await confirmMagicLink(kycAuthParams)
            saveKycTokens(tokens, kycAuthParams.uid)
            
            // Clear the auth params after use
            setKycAuthParams(undefined)
            
            // Immediately fetch status using the token we just received
            const statusResponse = await fetchKycStatus(tokens.accessToken)
            setKycStatus(statusResponse.status)
            setStatusMessage(statusResponse.message || '')
            setViewState('status')
            return
          } catch (err) {
            console.error('KYC auth error:', err)
            setError('Failed to confirm authentication. Please try again.')
            setViewState('error')
            return
          }
        }

        // Check if user has already provided their email
        const savedEmail = getKycEmail()
        if (savedEmail) {
          // Returning user - show their registered email
          setEmail(savedEmail)
          setViewState('registered')
        } else {
          // First time - collect email before showing webview
          setViewState('email')
        }
      } catch {
        setError('Failed to initialize verification. Please try again.')
        setViewState('error')
      }
    }

    initializeView()
  }, [kycAuthParams, setKycAuthParams])

  // iOS iframe load timeout detection
  useEffect(() => {
    if (viewState === 'webview' && isIOS() && !iframeLoaded) {
      // Start timeout - if iframe doesn't signal load, show fallback
      loadTimeoutRef.current = setTimeout(() => {
        if (!iframeLoaded) {
          setShowIosFallback(true)
        }
      }, IFRAME_LOAD_TIMEOUT)

      return () => {
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current)
        }
      }
    }
  }, [viewState, iframeLoaded])

  // Listen for messages from the iframe (for token capture)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from IDFlow domains
      if (!event.origin.includes('idflow.ch') && !event.origin.includes('azurewebsites.net')) {
        return
      }

      // Any message from iframe indicates it loaded successfully
      if (!iframeLoaded) {
        setIframeLoaded(true)
        setShowIosFallback(false)
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current)
          loadTimeoutRef.current = null
        }
      }

      // Handle load confirmation messages (recommended for IDFlow to implement)
      if (event.data?.type === 'kyc-ready' || event.data?.type === 'kyc-loaded') {
        console.log('KYC webview loaded successfully:', event.data.type)
        setIframeLoaded(true)
        setShowIosFallback(false)
      }

      // Handle font loading status
      if (event.data?.type === 'kyc-fonts-loaded') {
        console.log('KYC fonts loaded successfully, count:', event.data.count)
      }

      if (event.data?.type === 'kyc-fonts-failed') {
        console.error('KYC fonts failed to load:', event.data)
        if (isIOS()) {
          // Show fallback if fonts fail on iOS
          setShowIosFallback(true)
        }
      }

      if (event.data?.type === 'kyc-text-not-rendering') {
        console.error('KYC text is not rendering')
        if (isIOS()) {
          setShowIosFallback(true)
        }
      }

      // Handle token messages from the iframe
      if (event.data?.type === 'kyc-tokens') {
        const { accessToken, refreshToken, expiresIn, userId } = event.data
        if (accessToken && refreshToken && userId) {
          saveKycTokens({ accessToken, refreshToken, expiresIn: expiresIn || 3600 }, userId)
        }
      }

      // Handle status updates from the iframe
      if (event.data?.type === 'kyc-status') {
        const status = event.data.status as KycStatus
        saveKycStatus(status)
        setKycStatus(status)
        if (status === 'confirmed' || status === 'pending' || status === 'rejected') {
          setViewState('status')
        }
      }

      // Handle KYC completion
      if (event.data?.type === 'kyc-complete') {
        saveKycStatus('pending')
        setKycStatus('pending')
        setViewState('status')
      }

      // Handle errors from IDFlow (for debugging)
      if (event.data?.type === 'kyc-error') {
        console.error('KYC webview error:', event.data)
      }

      // Handle resource loading errors from IDFlow
      if (event.data?.type === 'kyc-resource-error') {
        console.error('KYC resource failed to load:', event.data)
        // Could show warning to user if critical resources fail
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [iframeLoaded])

  const handleRetry = () => {
    setShowIosFallback(false)
    setIframeLoaded(false)
    setEmail('')
    setEmailError('')
    setViewState('email')
  }

  const validateEmail = (value: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  }

  const handleEmailContinue = () => {
    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address.')
      return
    }
    setEmailError('')
    saveKycEmail(email)
    const baseUrl = getKycWebviewUrl()
    setWebviewUrl(`${baseUrl}?email=${encodeURIComponent(email)}`)
    setViewState('webview')
  }

  const handleCheckStatus = () => {
    const savedEmail = getKycEmail() || email
    const baseUrl = getKycWebviewUrl()
    setWebviewUrl(`${baseUrl}?email=${encodeURIComponent(savedEmail)}`)
    setViewState('webview')
  }

  // Returning user - email already registered
  if (viewState === 'registered') {
    return (
      <>
        <Header text='KYC - Verification' backFunc={handleBack} />
        <Content>
          <Padded>
            <FlexCol gap='1.5rem'>
              <div>
                <Text>Identity Verification</Text>
                <TextSecondary>
                  Your email is registered. Open the verification portal to complete or check your KYC status.
                </TextSecondary>
              </div>
              <IonInput
                value={email}
                readonly
                type='email'
                style={{
                  border: '1px solid var(--ion-color-medium)',
                  borderRadius: '8px',
                  padding: '0 0.75rem',
                  '--padding-start': '0.75rem',
                  opacity: 0.7,
                }}
              />
              <Button
                onClick={handleCheckStatus}
                label='Check Status'
              />
            </FlexCol>
          </Padded>
        </Content>
      </>
    )
  }

  // Email capture state
  if (viewState === 'email') {
    return (
      <>
        <Header text='KYC - Verification' backFunc={handleBack} />
        <Content>
          <Padded>
            <FlexCol gap='1.5rem'>
              <div>
                <Text>Enter your email address</Text>
                <TextSecondary>
                  Enter your email address to begin your KYC verification.
                </TextSecondary>
              </div>
              <IonInput
                value={email}
                onIonInput={(e) => {
                  setEmail(String(e.detail.value ?? ''))
                  if (emailError) setEmailError('')
                }}
                placeholder='you@example.com'
                type='email'
                autocomplete='email'
                style={{
                  border: '1px solid var(--ion-color-medium)',
                  borderRadius: '8px',
                  padding: '0 0.75rem',
                  '--padding-start': '0.75rem',
                }}
              />
              {emailError ? (
                <ErrorMessage error text={emailError} />
              ) : null}
              <Button
                onClick={handleEmailContinue}
                label='Continue'
              />
            </FlexCol>
          </Padded>
        </Content>
      </>
    )
  }

  // Loading state
  if (viewState === 'loading') {
    return (
      <>
        <Header text='KYC - Verification' backFunc={handleBack} />
        <Content>
          <Loading />
        </Content>
      </>
    )
  }

  // Error state
  if (viewState === 'error') {
    return (
      <>
        <Header text='KYC - Verification' backFunc={handleBack} />
        <Content>
          <Padded>
            <FlexCol>
              <ErrorMessage error text={error} />
            </FlexCol>
          </Padded>
        </Content>
      </>
    )
  }

  // Status display state
  if (viewState === 'status') {
    return (
      <>
        <Header text='KYC - Verification' backFunc={handleBack} />
        <Content>
          <Padded>
            <FlexCol gap='1.5rem'>
              {kycStatus === 'confirmed' && (
                <>
                  <SuccessMessage />
                  <div style={{ textAlign: 'center' }}>
                    <Text>Your identity has been verified!</Text>
                    <TextSecondary>
                      You have full access to all features.
                    </TextSecondary>
                  </div>
                </>
              )}

              {kycStatus === 'pending' && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
                  <Text>Verification in Progress</Text>
                  <TextSecondary>
                    Your documents are being reviewed. This usually takes 1-2 business days.
                  </TextSecondary>
                  {statusMessage ? (
                    <div style={{ marginTop: '0.5rem' }}>
                      <TextSecondary>
                        {statusMessage}
                      </TextSecondary>
                    </div>
                  ) : null}
                </div>
              )}

              {kycStatus === 'rejected' && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
                  <Text>Verification Unsuccessful</Text>
                  <TextSecondary>
                    Unfortunately, we could not verify your identity. Please try again with valid documents.
                  </TextSecondary>
                  {statusMessage ? (
                    <div style={{ marginTop: '0.5rem' }}>
                      <TextSecondary>
                        {statusMessage}
                      </TextSecondary>
                    </div>
                  ) : null}
                  <div style={{ marginTop: '1.5rem' }}>
                    <button
                      onClick={handleRetry}
                      style={{
                        padding: '0.75rem 1.5rem',
                        backgroundColor: 'var(--primary)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '1rem',
                      }}
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              )}
            </FlexCol>
          </Padded>
        </Content>
      </>
    )
  }

  // Webview state
  return (
    <>
      <Header text='KYC - Verification' backFunc={handleBack} />
      <Content>
        <div style={{ height: '100%', position: 'relative' }}>
          <FlexCol gap='0'>
            {/* iOS fallback banner */}
            {showIosFallback ? (
              <div
                style={{
                  padding: '1rem',
                  backgroundColor: 'var(--warning-bg, #fff3cd)',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  textAlign: 'center',
                }}
              >
                <div style={{ marginBottom: '0.5rem' }}>
                  <Text>Having trouble loading verification?</Text>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <TextSecondary>
                    iOS may have issues with embedded content. Open in Safari for the best experience.
                  </TextSecondary>
                </div>
                <button
                  onClick={openInExternalBrowser}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: 'var(--primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '1rem',
                  }}
                >
                  Open in Browser
                </button>
              </div>
            ) : null}
            <iframe
              ref={iframeRef}
              src={webviewUrl}
              title='KYC Verification'
              // Permissions for KYC functionality
              allow='camera; microphone; clipboard-write; clipboard-read; geolocation; fullscreen'
              // Relaxed sandbox - needed to allow font loading on iOS
              sandbox='allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads'
              referrerPolicy='strict-origin-when-cross-origin'
              onLoad={handleIframeLoad}
              onError={handleIframeError}
              style={{
                width: '100%',
                height: showIosFallback ? 'calc(100vh - 250px)' : 'calc(100vh - 100px)',
                border: 'none',
                borderRadius: '8px',
                // iOS-specific: ensure visibility and touch handling
                WebkitOverflowScrolling: 'touch',
                overflow: 'auto',
              }}
            />
          </FlexCol>
        </div>
      </Content>
    </>
  )
}
