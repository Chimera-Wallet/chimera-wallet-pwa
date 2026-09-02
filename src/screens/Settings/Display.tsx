import { useContext } from 'react'
import { CurrencyDisplay } from '../../lib/types'
import Select from '../../components/Select'
import Padded from '../../components/Padded'
import Content from '../../components/Content'
import { ConfigContext } from '../../providers/config'
import Header from './Header'
import {useTranslation} from 'react-i18next'

export default function Display() {
  const { backupConfig, config, updateConfig } = useContext(ConfigContext)

  const handleChange = async (currencyDisplay: string) => {
    const newConfig = { ...config, currencyDisplay: currencyDisplay as CurrencyDisplay }
    if (config.nostrBackup) await backupConfig(newConfig)
    updateConfig(newConfig)
  }
  const {t} = useTranslation()
  return (
    <>
      <Header text={t('settings.display.displayPref')} back />
      <Content>
        <Padded>
          <Select
            onChange={handleChange}
            options={[CurrencyDisplay.Both, CurrencyDisplay.Sats, CurrencyDisplay.Fiat]}
            selected={config.currencyDisplay}
          />
        </Padded>
      </Content>
    </>
  )
}
