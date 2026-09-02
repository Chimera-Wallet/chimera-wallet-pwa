import { useContext } from 'react'
import { Fiats } from '../../lib/types'
import Select from '../../components/Select'
import Padded from '../../components/Padded'
import Content from '../../components/Content'
import { ConfigContext } from '../../providers/config'
import Header from './Header'
import { useTranslation } from 'react-i18next'

export default function Fiat() {
  const { backupConfig, config, updateConfig } = useContext(ConfigContext)

  const handleChange = async (fiat: string) => {
    const newConfig = { ...config, fiat: fiat as Fiats }
    if (config.nostrBackup) await backupConfig(newConfig)
    updateConfig(newConfig)
  }

  const {t} = useTranslation()
  return (
    <>
      <Header text= {t('settings.fiat.fiat')} back />
      <Content>
        <Padded>
          <Select
            onChange={handleChange}
            options={[Fiats.USD, Fiats.EUR, Fiats.CHF]}
            selected={config.fiat}
          />
        </Padded>
      </Content>
    </>
  )
}
