import { useState, useContext, useEffect } from 'react'
import { NavigationContext, Pages } from '../../providers/navigation'
import { getAppConfig, getAppUrl, type AppConfig } from '../../lib/appConfig'
import AppInfoPage from './AppInfoPage'
import AppTermsPage from './AppTermsPage'
import AppWebView from './AppWebView'

type AppStep = 'info' | 'terms' | 'webview'

interface AppWrapperProps {
  appId: string
}

/**
 * Generic app wrapper that handles the flow:
 * 1. Info page (if configured)
 * 2. Terms page (if configured)
 * 3. WebView
 */
export default function AppWrapper({ appId }: AppWrapperProps) {
  const { navigate } = useContext(NavigationContext)
  const [step, setStep] = useState<AppStep>('info')
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [appUrl, setAppUrl] = useState<string>('')

  useEffect(() => {
    const appConfig = getAppConfig(appId)
    if (appConfig) {
      setConfig(appConfig)
      setAppUrl(getAppUrl(appConfig))

      // Determine starting step based on config
      if (!appConfig.infoSlides || appConfig.infoSlides.length === 0) {
        if (appConfig.terms) {
          setStep('terms')
        } else {
          setStep('webview')
        }
      }
    }
  }, [appId])

  const handleBack = () => {
    navigate(Pages.Apps)
  }

  const handleInfoContinue = () => {
    if (config?.terms) {
      setStep('terms')
    } else {
      setStep('webview')
    }
  }

  const handleTermsBack = () => {
    if (config?.infoSlides && config.infoSlides.length > 0) {
      setStep('info')
    } else {
      handleBack()
    }
  }

  const handleTermsAccept = () => {
    setStep('webview')
  }

  const handleWebViewBack = () => {
    // Go back to apps list, not previous steps
    navigate(Pages.Apps)
  }

  if (!config) {
    return null
  }

  switch (step) {
    case 'info':
      if (config.infoSlides && config.infoSlides.length > 0) {
        return (
          <AppInfoPage
            appName={config.name}
            slides={config.infoSlides}
            onContinue={handleInfoContinue}
            onBack={handleBack}
          />
        )
      }
      // Fall through to terms or webview if no info slides
      if (config.terms) {
        return (
          <AppTermsPage appName={config.name} terms={config.terms} onAccept={handleTermsAccept} onBack={handleBack} />
        )
      }
      return <AppWebView appName={config.name} url={appUrl} onBack={handleBack} />

    case 'terms':
      if (config.terms) {
        return (
          <AppTermsPage
            appName={config.name}
            terms={config.terms}
            onAccept={handleTermsAccept}
            onBack={handleTermsBack}
          />
        )
      }
      // Fall through to webview if no terms
      return <AppWebView appName={config.name} url={appUrl} onBack={handleWebViewBack} />

    case 'webview':
    default:
      return <AppWebView appName={config.name} url={appUrl} onBack={handleWebViewBack} />
  }
}
