import { useContext, useEffect, useState, useRef, useCallback } from 'react'
import { IonCheckbox, IonInput } from '@ionic/react'
import Header from './Header'
import Content from '../../components/Content'
import Padded from '../../components/Padded'
import FlexCol from '../../components/FlexCol'
import FlexRow from '../../components/FlexRow'
import Text, { TextSecondary } from '../../components/Text'
import Loading from '../../components/Loading'
import Button from '../../components/Button'
import SuccessMessage from '../../components/Success'
import ErrorMessage from '../../components/Error'
import Info from '../../components/Info'
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
  getValidAccessToken,
  requestMagicLink,
  checkSessionVerified,
  saveKycTokensFromLoginModel,
  mapVerificationStatus,
} from '../../lib/kyc'
import { isIOS } from '../../lib/browser'

type ViewState = 'loading' | 'email' | 'consent' | 'magic-link-sent' | 'registered' | 'webview' | 'status' | 'error'

const POLL_INTERVAL_MS = 5_000
const POLL_TIMEOUT_MS = 120_000
const RESEND_MAX = 3
const RESEND_COOLDOWN_SECS = 30
const IFRAME_LOAD_TIMEOUT = 8_000

export default function Verification() {
  const { kycAuthParams, setKycAuthParams } = useContext(FlowContext)
  const { screen, goBack: navGoBack } = useContext(NavigationContext)
  const { goBack: optionsGoBack } = useContext(OptionsContext)

  const isStandalonePage = screen === Pages.SettingsKYC
  const handleBack = isStandalonePage ? navGoBack : optionsGoBack

  const [viewState, setViewState] = useState<ViewState>('loading')
  const [kycStatus, setKycStatus] = useState<KycStatus>('not_started')
  const [statusMessage, setStatusMessage] = useState('')
  const [webviewUrl, setWebviewUrl] = useState('')
  const [error, setError] = useState('')

  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [isEditingEmail, setIsEditingEmail] = useState(false)

  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [isSendingLink, setIsSendingLink] = useState(false)
  const [sendError, setSendError] = useState('')

  const [sessionId, setSessionId] = useState('')
  const [pollingTimedOut, setPollingTimedOut] = useState(false)
  const [resendCount, setResendCount] = useState(0)
  const [resendCooldown, setResendCooldown] = useState(0)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [showIosFallback, setShowIosFallback] = useState(false)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
  }, [])

  const startPolling = useCallback(
    (pollEmail: string, pollSessionId: string) => {
      stopPolling()
      setPollingTimedOut(false)

      const tick = async () => {
        try {
          const result = await checkSessionVerified(pollEmail, pollSessionId)
          if (result.isVerified && result.loginModel) {
            stopPolling()
            saveKycTokensFromLoginModel(result.loginModel)
            const mapped = mapVerificationStatus(result.loginModel.verificationStatus?.status)
            setKycStatus(mapped)
            setStatusMessage(result.loginModel.verificationStatus?.notes || '')
            if (mapped === 'confirmed') {
              setViewState('status')
            } else {
              const baseUrl = getKycWebviewUrl()
              setWebviewUrl(`${baseUrl}?email=${encodeURIComponent(pollEmail)}`)
              setViewState('webview')
            }
          }
        } catch {
          /* keep polling */
        }
      }

      pollIntervalRef.current = setInterval(tick, POLL_INTERVAL_MS)
      pollTimeoutRef.current = setTimeout(() => {
        stopPolling()
        setPollingTimedOut(true)
      }, POLL_TIMEOUT_MS)
    },
    [stopPolling],
  )

  const startCooldown = useCallback(() => {
    setResendCooldown(RESEND_COOLDOWN_SECS)
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1_000)
  }, [])

  useEffect(() => {
    return () => {
      stopPolling()
      if (cooldownRef.current) clearInterval(cooldownRef.current)
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current)
    }
  }, [stopPolling])

  useEffect(() => {
    const initializeView = async () => {
      try {
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

  useEffect(() => {
    if (viewState === 'webview' && isIOS() && !iframeLoaded) {
      loadTimeoutRef.current = setTimeout(() => {
        if (!iframeLoaded) setShowIosFallback(true)
      }, IFRAME_LOAD_TIMEOUT)
      return () => {
        if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current)
      }
    }
  }, [viewState, iframeLoaded])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.origin.includes('idflow.ch') && !event.origin.includes('azurewebsites.net')) return
      if (!iframeLoaded) {
        setIframeLoaded(true)
        setShowIosFallback(false)
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current)
          loadTimeoutRef.current = null
        }
      }
      if (event.data?.type === 'kyc-ready' || event.data?.type === 'kyc-loaded') {
        setIframeLoaded(true)
        setShowIosFallback(false)
      }
      if (event.data?.type === 'kyc-fonts-failed' || event.data?.type === 'kyc-text-not-rendering') {
        if (isIOS()) setShowIosFallback(true)
      }
      if (event.data?.type === 'kyc-tokens') {
        const { accessToken, refreshToken, expiresIn, userId } = event.data
        if (accessToken && refreshToken && userId)
          saveKycTokens({ accessToken, refreshToken, expiresIn: expiresIn || 3600 }, userId)
      }
      if (event.data?.type === 'kyc-status') {
        const status = event.data.status as KycStatus
        saveKycStatus(status)
        setKycStatus(status)
        if (status === 'confirmed' || status === 'pending' || status === 'rejected') setViewState('status')
      }
      if (event.data?.type === 'kyc-complete') {
        saveKycStatus('pending')
        setKycStatus('pending')
        setViewState('status')
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [iframeLoaded])

  const validateEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

  const handleEmailContinue = () => {
    if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address.')
      return
    }
    setEmailError('')
    saveKycEmail(email)
    setPrivacyAccepted(false)
    setTermsAccepted(false)
    setSendError('')
    setViewState('consent')
  }

  const handleProceed = async () => {
    if (!privacyAccepted || !termsAccepted) return
    setSendError('')
    setIsSendingLink(true)
    try {
      const newSessionId = crypto.randomUUID()
      setSessionId(newSessionId)
      await requestMagicLink(email, newSessionId)
      setResendCount(0)
      startCooldown()
      setPollingTimedOut(false)
      startPolling(email, newSessionId)
      setViewState('magic-link-sent')
    } catch {
      setSendError('Failed to send verification email. Please try again.')
    } finally {
      setIsSendingLink(false)
    }
  }

  const handleResend = async () => {
    if (resendCount >= RESEND_MAX || resendCooldown > 0) return
    setSendError('')
    setIsSendingLink(true)
    try {
      const newSessionId = crypto.randomUUID()
      setSessionId(newSessionId)
      await requestMagicLink(email, newSessionId)
      setResendCount((c) => c + 1)
      startCooldown()
      setPollingTimedOut(false)
      startPolling(email, newSessionId)
    } catch {
      setSendError('Failed to resend email. Please try again.')
    } finally {
      setIsSendingLink(false)
    }
  }

  const handleTryAgain = () => {
    stopPolling()
    setPollingTimedOut(false)
    setResendCount(0)
    setResendCooldown(0)
    setSendError('')
    setViewState('consent')
  }

  const handleCheckStatus = async () => {
    const token = await getValidAccessToken()
    if (token) {
      try {
        const statusResponse = await fetchKycStatus(token)
        setKycStatus(statusResponse.status)
        setStatusMessage(statusResponse.message || '')
        setViewState('status')
        return
      } catch {
        /* fall through */
      }
    }
    setPrivacyAccepted(false)
    setTermsAccepted(false)
    setSendError('')
    setViewState('consent')
  }

  const handleRetry = () => {
    setShowIosFallback(false)
    setIframeLoaded(false)
    setEmail('')
    setEmailError('')
    setIsEditingEmail(false)
    setViewState('email')
  }

  const openInExternalBrowser = useCallback(() => {
    window.open(webviewUrl || getKycWebviewUrl(), '_blank', 'noopener,noreferrer')
  }, [webviewUrl])

  const handleIframeLoad = useCallback(() => {
    setIframeLoaded(true)
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current)
      loadTimeoutRef.current = null
    }
  }, [])

  const handleIframeError = useCallback(() => {
    if (isIOS()) setShowIosFallback(true)
  }, [])

  if (viewState === 'loading') {
    return (
      <>
        <Header text='KYC - Verification' backFunc={handleBack} />
        <Content>
          <Loading simple />
        </Content>
      </>
    )
  }

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

  if (viewState === 'email') {
    return (
      <>
        <Header text='KYC - Verification' backFunc={handleBack} />
        <Content>
          <Padded>
            <FlexCol gap='1.5rem'>
              <div>
                <Text>Enter your email address</Text>
                <TextSecondary>Enter your email address to begin your KYC verification.</TextSecondary>
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
              {emailError ? <ErrorMessage error text={emailError} /> : null}
              <Button onClick={handleEmailContinue} label='Continue' />
            </FlexCol>
          </Padded>
        </Content>
      </>
    )
  }

  if (viewState === 'registered') {
    const savedEmail = getKycEmail() || ''
    const emailChanged = isEditingEmail && email !== savedEmail
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
                readonly={!isEditingEmail}
                type='email'
                onIonInput={(e) => {
                  setEmail(String(e.detail.value ?? ''))
                  if (emailError) setEmailError('')
                }}
                onIonFocus={() => setIsEditingEmail(true)}
                placeholder='you@example.com'
                style={{
                  border: `1px solid ${emailChanged ? 'var(--ion-color-warning)' : 'var(--ion-color-medium)'}`,
                  borderRadius: '8px',
                  padding: '0 0.75rem',
                  '--padding-start': '0.75rem',
                  opacity: isEditingEmail ? 1 : 0.7,
                }}
              />
              {emailChanged ? (
                <Info color='orange' title='Email change'>
                  <Text small thin wrap color='orange'>
                    Changing your email address will require you to re-submit your KYC verification.
                  </Text>
                </Info>
              ) : null}
              {emailError ? <ErrorMessage error text={emailError} /> : null}
              <Button
                onClick={emailChanged ? handleEmailContinue : handleCheckStatus}
                label={emailChanged ? 'Re-submit KYC' : 'Check Status'}
              />
            </FlexCol>
          </Padded>
        </Content>
      </>
    )
  }

  if (viewState === 'consent') {
    const canProceed = privacyAccepted && termsAccepted
    const checkboxStyle: React.CSSProperties = {
      border: '1px solid var(--dark50)',
      borderRadius: '0.5rem',
      margin: '0 2px',
      padding: '0.5rem',
    }
    return (
      <>
        <Header text='KYC - Verification' backFunc={handleBack} />
        <Content>
          <Padded>
            <FlexCol gap='1.5rem'>
              <div>
                <Text>Review &amp; Accept</Text>
                <TextSecondary>
                  Before we send your verification email, please review and accept the following.
                </TextSecondary>
              </div>
              <div style={checkboxStyle}>
                <FlexRow>
                  <IonCheckbox
                    labelPlacement='end'
                    checked={privacyAccepted}
                    onIonChange={(e) => setPrivacyAccepted(e.detail.checked)}
                  >
                    I have read and agree to the{' '}
                    <a
                      href='https://outlogic.net/privacy-policy/'
                      target='_blank'
                      rel='noopener noreferrer'
                      style={{ color: 'var(--primary)' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Privacy Policy
                    </a>
                  </IonCheckbox>
                </FlexRow>
              </div>
              <div style={checkboxStyle}>
                <FlexRow>
                  <IonCheckbox
                    labelPlacement='end'
                    checked={termsAccepted}
                    onIonChange={(e) => setTermsAccepted(e.detail.checked)}
                  >
                    I have read and agree to the{' '}
                    <a
                      href='https://outlogic.net/terms-conditions/'
                      target='_blank'
                      rel='noopener noreferrer'
                      style={{ color: 'var(--primary)' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Terms of Service
                    </a>
                  </IonCheckbox>
                </FlexRow>
              </div>
              {sendError ? <ErrorMessage error text={sendError} /> : null}
              <Button
                onClick={handleProceed}
                label={isSendingLink ? 'Sending...' : 'Proceed'}
                disabled={!canProceed || isSendingLink}
                loading={isSendingLink}
              />
            </FlexCol>
          </Padded>
        </Content>
      </>
    )
  }

  if (viewState === 'magic-link-sent') {
    const canResend = resendCount < RESEND_MAX && resendCooldown === 0 && !isSendingLink
    const resendLabel =
      resendCooldown > 0
        ? `Resend in ${resendCooldown}s`
        : resendCount >= RESEND_MAX
          ? 'Resend limit reached'
          : isSendingLink
            ? 'Sending...'
            : 'Resend email'

    if (pollingTimedOut) {
      return (
        <>
          <Header text='KYC - Verification' backFunc={handleBack} />
          <Content>
            <Padded>
              <FlexCol gap='1.5rem' centered>
                <div style={{ fontSize: '3rem' }}>⏱️</div>
                <Text>Verification timed out</Text>
                <TextSecondary>We didn't detect a link click within 2 minutes. Please try again.</TextSecondary>
                {sendError ? <ErrorMessage error text={sendError} /> : null}
                <Button onClick={handleTryAgain} label='Try Again' />
              </FlexCol>
            </Padded>
          </Content>
        </>
      )
    }

    return (
      <>
        <Header text='KYC - Verification' backFunc={handleBack} />
        <Content>
          <Padded>
            <FlexCol gap='1.5rem' centered>
              <div style={{ fontSize: '3rem' }}>📧</div>
              <Text>Check your inbox</Text>
              <TextSecondary>
                We've sent a verification link to <strong>{email}</strong>. Click the link to continue.
              </TextSecondary>
              <Loading simple />
              <TextSecondary>Waiting for verification…</TextSecondary>
              {sendError ? <ErrorMessage error text={sendError} /> : null}
              <Button onClick={handleResend} label={resendLabel} disabled={!canResend} secondary />
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
                    <TextSecondary>You have full access to all features.</TextSecondary>
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
                      <TextSecondary>{statusMessage}</TextSecondary>
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
                      <TextSecondary>{statusMessage}</TextSecondary>
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
