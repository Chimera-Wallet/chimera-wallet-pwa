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
  const advancedSubItems: MenuRow[] = [
    { icon: <ServerIcon />, option: SettingsOptions.Server, label: 'Server' },
    { icon: <LogsIcon />, option: SettingsOptions.Logs, label: 'Logs' },
    { icon: <VtxosIcon />, option: SettingsOptions.Vtxos, label: 'Coin Control' },
    { icon: <CogIcon />, option: SettingsOptions.Delegates, label: 'Delegates' },
    { icon: <HashIcon />, option: SettingsOptions.Contracts, label: 'Contracts' },
    { icon: <KeyIcon size={20} />, option: SettingsOptions.Password, label: 'Change Password' },
    { icon: <LockIcon />, option: SettingsOptions.Lock, label: 'Lock Wallet' },
    {
      icon: <WarningTriangle />,
      option: SettingsOptions.Reset,
      label: 'Delete Mnemonic',
      badge: { text: 'High Risk', tone: 'danger' },
      danger: true,
    },
  ]

  return (
    <>
      <Header text='Advanced Settings' back />
      <Content>
        <Menu rows={advancedSubItems} />
      </Content>
    </>
  )
}
