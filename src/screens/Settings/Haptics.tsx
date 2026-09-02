import Header from './Header'
import { useContext } from 'react'
import Padded from '../../components/Padded'
import Toggle from '../../components/Toggle'
import Content from '../../components/Content'
import { ConfigContext } from '../../providers/config'
import {useTranslation} from 'react-i18next'

export default function Haptics() {
  const { backupConfig, config, updateConfig } = useContext(ConfigContext)

  const {t} = useTranslation()

  const handleChange = async () => {
    const newConfig = { ...config, haptics: !config.haptics }
    if (config.nostrBackup) await backupConfig(newConfig)
    updateConfig(newConfig)
  }

  return (
    <>
      <Header text={t('settings.haptics.haptics')} back />
      <Content>
        <Padded>
          <Toggle
            checked={config.haptics}
            onClick={handleChange}
            text={t('settings.haptics.feedback')}
            subtext={t('settings.haptics.vibration')}
          />
        </Padded>
      </Content>
    </>
  )
}
