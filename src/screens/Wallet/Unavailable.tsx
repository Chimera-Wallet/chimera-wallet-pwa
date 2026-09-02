import CenterScreen from '../../components/CenterScreen'
import ErrorMessage from '../../components/Error'
import WalletNewIcon from '../../icons/WalletNew'
import Text from '../../components/Text'
import { AspContext } from '../../providers/asp'
import { useContext, useEffect, useState } from 'react'
import { isIOS } from '../../lib/browser'
import { detectJSCapabilities, getRestrictedEnvironmentMessage } from '../../lib/jsCapabilities'
import {useTranslation} from 'react-i18next'
import { getMissingRequiredConfig } from '../../lib/requiredConfig'

export default function Unavailable() {
  const { aspInfo } = useContext(AspContext)

  const [error, setError] = useState('')
  
  const {t} = useTranslation()

  // Check JavaScript capabilities on mount
  useEffect(() => {
    const missingConfig = getMissingRequiredConfig()
    if (missingConfig.length) {
      return setError('Chimera could not start due to a configuration error. Please contact support.')
    }
    if (aspInfo.unreachable) return setError(t('errors.send.arkade.server'))
    detectJSCapabilities()
      .then((result) => {
        if (result.isSupported) return
        // Use specific error message or fallback to iOS/generic message
        setError(result.errorMessage || getRestrictedEnvironmentMessage(isIOS()))
      })
      .catch(() => {
        setError(getRestrictedEnvironmentMessage(isIOS()))
      })
  }, [])

  return (
    <CenterScreen>
      <WalletNewIcon />
      <Text bigger heading medium>
        {t('common.general.chimeraWallet')}
      </Text>
      <ErrorMessage error text={error} />
    </CenterScreen>
  )
}
