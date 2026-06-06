import { useContext } from 'react'
import Header from './Header'
import { type Option } from '../../providers/options'
import Content from '../../components/Content'
import { SettingsSections, SettingsOptions } from '../../lib/types'
import Menu from '../../components/Menu'
import { DevModeContext } from '../../providers/devMode'
import LockIcon from '../../icons/Lock'
import ResetIcon from '../../icons/Reset'
import ServerIcon from '../../icons/Server'
import LogsIcon from '../../icons/Logs'
import VtxosIcon from '../../icons/Vtxos'
import CogIcon from '../../icons/Cog'

export default function Advanced() {
  // Create sub-items for Advanced Settings screen
  const advancedSubItems: Option[] = [
    {
      icon: <ServerIcon />,
      option: SettingsOptions.Server,
      section: SettingsSections.Advanced,
    },
    {
      icon: <LogsIcon />,
      option: SettingsOptions.Logs,
      section: SettingsSections.Advanced,
    },
    {
      icon: <VtxosIcon />,
      option: SettingsOptions.Vtxos,
      section: SettingsSections.Advanced,
    },
    {
      icon: <></>,
      option: SettingsOptions.Delegates,
      section: SettingsSections.Advanced,
    },
    {
      icon: <></>,
      option: SettingsOptions.Contracts,
      section: SettingsSections.Advanced,
    },
    {
      icon: <CogIcon />,
      option: SettingsOptions.Password,
      section: SettingsSections.Advanced,
    },
    {
      icon: <LockIcon />,
      option: SettingsOptions.Lock,
      section: SettingsSections.Advanced,
    },
    {
      icon: <ResetIcon />,
      option: SettingsOptions.Reset,
      section: SettingsSections.Advanced,
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
