import { useContext } from 'react'
import { ConfigContext } from '../../providers/config'
import Padded from '../../components/Padded'
import { notificationApiSupport, requestPermission, sendTestNotification } from '../../lib/notifications'
import Header from './Header'
import Content from '../../components/Content'
import Toggle from '../../components/Toggle'
import {useTranslation} from 'react-i18next'

export default function Notifications() {
  const { backupConfig, config, updateConfig } = useContext(ConfigContext)
  const {t} = useTranslation()

  const handleChange = async () => {
    if (!notificationApiSupport) return
    if (!config.notifications) {
      requestPermission().then(async (notifications) => {
        const newConfig = { ...config, notifications }
        if (config.nostrBackup) await backupConfig(newConfig)
        if (notifications) sendTestNotification()
        updateConfig(newConfig)
      })
    } else {
      const newConfig = { ...config, notifications: false }
      if (config.nostrBackup) await backupConfig(newConfig)
      updateConfig(newConfig)
    }
  }

  const subText = notificationApiSupport
    ? t('settings.notifications.update')
    : t('settings.notifications.unsupported')
  return (
    <>
      <Header text={t('settings.notifications.notifications')} back />
      <Content>
        <Padded>
          <Toggle
            subtext={subText}
            onClick={handleChange}
            text={t('settings.notifications.allow')}
            testId='toggle-notifications'
            checked={config.notifications}
          />
        </Padded>
      </Content>
    </>
  )
}
