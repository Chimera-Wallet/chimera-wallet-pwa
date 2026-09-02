import { useContext } from 'react'
import AddressBook from './AddressBook'
import Lock from './Lock'
import Notifications from './Notifications'
import Backup from './Backup'
import Biometric from './Biometric'
import Reset from './Reset'
import About from './About'
import Vtxos from './Vtxos'
import NotesForm from '../Wallet/Notes/Form'
import Server from './Server'
import Support from './Support'
import Verification from './Verification'
import KnowledgeBase from './KnowledgeBase'
import Language from './Language'
import { OptionsContext } from '../../providers/options'
import SettingsMenu from './Menu'
import Logs from './Logs'
import { SettingsOptions } from '../../lib/types'
import Advanced from './Advanced'
import General from './General'
import Theme from './Theme'
import Fiat from './Fiat'
import Display from './Display'
import Password from './Password'
import Delegates from './Delegates'
import SettingsPageTransition from '../../components/SettingsPageTransition'
import Haptics from './Haptics'
import Contracts from './Contracts'
import Solvers from './Solvers'

function settingsContent(option: SettingsOptions): JSX.Element {
  switch (option) {
    case SettingsOptions.Menu:
      return <SettingsMenu />
    case SettingsOptions.About:
      return <About />
    case SettingsOptions.AddressBook:
      return <AddressBook />
    case SettingsOptions.Advanced:
      return <Advanced />
    case SettingsOptions.Backup:
      return <Backup />
    case SettingsOptions.Biometric:
      return <Biometric />
    case SettingsOptions.Currency:
      return <Fiat />
    case SettingsOptions.Delegates:
      return <Delegates />
    case SettingsOptions.General:
      return <General />
    case SettingsOptions.KnowledgeBase:
      return <KnowledgeBase />
    case SettingsOptions.KYC:
      return <Verification />
    case SettingsOptions.Language:
      return <Language />
    case SettingsOptions.Lock:
      return <Lock />
    case SettingsOptions.Logs:
      return <Logs />
    case SettingsOptions.ManageAccount:
      return <About /> // Placeholder - reuse About page for now
    case SettingsOptions.Notifications:
      return <Notifications />
    case SettingsOptions.Notes:
      return <NotesForm />
    case SettingsOptions.Password:
      return <Password />
    case SettingsOptions.Reset:
      return <Reset />
    case SettingsOptions.SecretPhrase:
      return <Backup /> // Show secret key uses Backup page
    case SettingsOptions.Server:
      return <Server />
    case SettingsOptions.Support:
      return <Support />
    case SettingsOptions.Vtxos:
      return <Vtxos />
    case SettingsOptions.Contracts:
      return <Contracts />
    case SettingsOptions.Theme:
      return <Theme />
    case SettingsOptions.Fiat:
      return <Fiat />
    case SettingsOptions.Display:
      return <Display />
    case SettingsOptions.Haptics:
      return <Haptics />
    case SettingsOptions.Solvers:
      return <Solvers/>
    default:
      return <></>
  }
}

export default function Settings() {
  const { option, direction } = useContext(OptionsContext)

  return (
    <SettingsPageTransition direction={direction} optionKey={String(option)}>
      {settingsContent(option)}
    </SettingsPageTransition>
  )
}
