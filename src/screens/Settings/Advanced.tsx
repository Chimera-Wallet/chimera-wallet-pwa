import Header from './Header'
import Content from '../../components/Content'
import { SettingsOptions } from '../../lib/types'
import Menu, { MenuRow } from '../../components/Menu'
import ServerIcon from '../../icons/Server'
import LogsIcon from '../../icons/Logs'
import VtxosIcon from '../../icons/Vtxos'
import CogIcon from '../../icons/Cog'
import KeyIcon from '../../icons/Key'
import LockIcon from '../../icons/Lock'
import HashIcon from '../../icons/Hash'
import CurrencySwapIcon from '../../icons/CurrencySwap'
import {useTranslation} from 'react-i18next'

// warning triangle shown on the destructive "Delete Mnemonic" row
function WarningTriangle() {
  return (
    <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
      <path d='M12 3L2 20h20L12 3z' strokeLinejoin='round' />
      <path d='M12 9v5' strokeLinecap='round' />
      <circle cx='12' cy='17' r='0.6' fill='currentColor' stroke='none' />
    </svg>
  )
}

export default function Advanced() {
  const {t} = useTranslation()
  const advancedSubItems: MenuRow[] = [
    { icon: <ServerIcon />, option: SettingsOptions.Server, label: t('common.general.server') },
    { icon: <LogsIcon />, option: SettingsOptions.Logs, label: t('common.general.logs') },
    { icon: <VtxosIcon />, option: SettingsOptions.Vtxos, label: t('common.general.coinControl') },
    { icon: <CogIcon />, option: SettingsOptions.Delegates, label: t('common.general.delegates') },
    { icon: <HashIcon />, option: SettingsOptions.Contracts, label: t('common.general.contracts') },
    { icon: <CurrencySwapIcon />, option: SettingsOptions.Solvers, label: t('common.general.solvers') },
    { icon: <KeyIcon size={20} />, option: SettingsOptions.Password, label: t('settings.advanced.changePass') },
    { icon: <LockIcon />, option: SettingsOptions.Lock, label: t('settings.advanced.lockWallet') },
    {
      icon: <WarningTriangle />,
      option: SettingsOptions.Reset,
      label: t('settings.advanced.deleteMnemonic'),
      badge: { text: t('settings.advanced.highRisk'), tone: 'danger' },
      danger: true,
    },
  ]

  return (
    <>
      <Header text= {t('settings.advanced.advancedSettings')} back />
      <Content>
        <Menu rows={advancedSubItems} />
      </Content>
    </>
  )
}
