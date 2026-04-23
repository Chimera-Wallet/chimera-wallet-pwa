import AddressBookIcon from '../icons/AddressBook'
import { ReactElement, ReactNode, createContext, useCallback, useState } from 'react'
import BackupIcon from '../icons/Backup'
import InfoIcon from '../icons/Info'
import KnowledgeBaseIcon from '../icons/KnowledgeBase'
import KYCIcon from '../icons/KYC'
import NotificationIcon from '../icons/Notification'
import ResetIcon from '../icons/Reset'
import NotesIcon from '../icons/Notes'
import VtxosIcon from '../icons/Vtxos'
import ServerIcon from '../icons/Server'
import LogsIcon from '../icons/Logs'
import SupportIcon from '../icons/Support'
import { SettingsOptions, SettingsSections } from '../lib/types'
import CogIcon from '../icons/Cog'
import LockIcon from '../icons/Lock'
import PuzzleIcon from '../icons/Puzzle'

export interface Option {
  icon: ReactElement
  option: SettingsOptions
  section: SettingsSections
}

export const options: Option[] = [
  // Account Section
  {
    icon: <KYCIcon />,
    option: SettingsOptions.KYC,
    section: SettingsSections.Account,
  },
  {
    icon: <KnowledgeBaseIcon />,
    option: SettingsOptions.KnowledgeBase,
    section: SettingsSections.Account,
  },
  {
    icon: <CogIcon />,
    option: SettingsOptions.ManageAccount,
    section: SettingsSections.Account,
  },
  {
    icon: <AddressBookIcon />,
    option: SettingsOptions.AddressBook,
    section: SettingsSections.Account,
  },
  // Security Section
  {
    icon: <LockIcon />,
    option: SettingsOptions.Biometric,
    section: SettingsSections.Security,
  },
  {
    icon: <BackupIcon />,
    option: SettingsOptions.SecretPhrase,
    section: SettingsSections.Security,
  },
  // App Section
  {
    icon: <InfoIcon />,
    option: SettingsOptions.Language,
    section: SettingsSections.App,
  },
  {
    icon: <CogIcon />,
    option: SettingsOptions.Currency,
    section: SettingsSections.App,
  },
  {
    icon: <NotificationIcon />,
    option: SettingsOptions.Notifications,
    section: SettingsSections.App,
  },
  // Advanced Section
  {
    icon: <PuzzleIcon />,
    option: SettingsOptions.Advanced,
    section: SettingsSections.Advanced,
  },
  // Hidden/Config options
  {
    icon: <InfoIcon />,
    option: SettingsOptions.About,
    section: SettingsSections.Config,
  },
  {
    icon: <BackupIcon />,
    option: SettingsOptions.Backup,
    section: SettingsSections.Config,
  },
  {
    icon: <LockIcon />,
    option: SettingsOptions.Lock,
    section: SettingsSections.Config,
  },
  {
    icon: <LogsIcon />,
    option: SettingsOptions.Logs,
    section: SettingsSections.Config,
  },
  {
    icon: <ResetIcon />,
    option: SettingsOptions.Reset,
    section: SettingsSections.Config,
  },
  {
    icon: <ServerIcon />,
    option: SettingsOptions.Server,
    section: SettingsSections.Config,
  },
  {
    icon: <NotesIcon />,
    option: SettingsOptions.Notes,
    section: SettingsSections.Config,
  },
  {
    icon: <SupportIcon />,
    option: SettingsOptions.Support,
    section: SettingsSections.Config,
  },
  {
    icon: <VtxosIcon />,
    option: SettingsOptions.Vtxos,
    section: SettingsSections.Config,
  },
  {
    icon: <></>,
    option: SettingsOptions.Theme,
    section: SettingsSections.Config,
  },
  {
    icon: <></>,
    option: SettingsOptions.Fiat,
    section: SettingsSections.Config,
  },
  {
    icon: <></>,
    option: SettingsOptions.Display,
    section: SettingsSections.Config,
  },
  {
    icon: <></>,
    option: SettingsOptions.Haptics,
    section: SettingsSections.Config,
  },
  {
    icon: <></>,
    option: SettingsOptions.Password,
    section: SettingsSections.Config,
  },
]

export interface SectionResponse {
  section: SettingsSections
  options: Option[]
}

const allOptions: SectionResponse[] = [
  SettingsSections.Account,
  SettingsSections.Security,
  SettingsSections.App,
  SettingsSections.Advanced,
].map((section) => {
  return {
    section,
    options: options.filter((o) => o.section === section),
  }
})

export type SettingsDirection = 'forward' | 'back'

interface OptionsContextProps {
  direction: SettingsDirection
  option: SettingsOptions
  options: Option[]
  goBack: () => void
  setOption: (o: SettingsOptions) => void
  validOptions: () => SectionResponse[]
}

export const OptionsContext = createContext<OptionsContextProps>({
  direction: 'forward',
  option: SettingsOptions.Menu,
  options: [],
  goBack: () => {},
  setOption: () => {},
  validOptions: () => [],
})

export const OptionsProvider = ({ children }: { children: ReactNode }) => {
  const [option, setOption] = useState(SettingsOptions.Menu)
  const [direction, setDirection] = useState<SettingsDirection>('forward')

  const optionSection = (opt: SettingsOptions): SettingsSections => {
    return options.find((o) => o.option === opt)?.section || SettingsSections.General
  }

  const navigateToOption = useCallback(
    (o: SettingsOptions) => {
      setDirection('forward')
      setOption(o)
    },
    [setOption],
  )

  const goBack = useCallback(() => {
    setDirection('back')
    setOption((current) => {
      // If we're on a specific settings page, determine where to go back
      if (current === SettingsOptions.Menu) {
        return SettingsOptions.Menu // Already at top level
      }

      const section = optionSection(current)

      // Handle Config section items (these are sub-items within other sections)
      if (section === SettingsSections.Config) {
        // Items like Theme, Display, Haptics are under General (if still used)
        if (
          current === SettingsOptions.Theme ||
          current === SettingsOptions.Display ||
          current === SettingsOptions.Haptics
        ) {
          return SettingsOptions.General
        }
        // Fiat goes directly from App > Currency, so back goes to menu
        if (current === SettingsOptions.Fiat) {
          return SettingsOptions.Menu
        }
        // Items like Lock, Reset, Server, Logs, Vtxos, Password are under Advanced
        if (
          current === SettingsOptions.Lock ||
          current === SettingsOptions.Reset ||
          current === SettingsOptions.Server ||
          current === SettingsOptions.Logs ||
          current === SettingsOptions.Vtxos ||
          current === SettingsOptions.Password
        ) {
          return SettingsOptions.Advanced
        }
        // Items like Backup are standalone in Security but kept in Config for routing
        // Go back to menu for these
        return SettingsOptions.Menu
      }

      // For items in Account, Security, App, Advanced sections, go back to menu
      return SettingsOptions.Menu
    })
  }, [setOption])

  const validOptions = (): SectionResponse[] => {
    return allOptions
  }

  return (
    <OptionsContext.Provider
      value={{
        direction,
        option,
        options,
        goBack,
        setOption: navigateToOption,
        validOptions,
      }}
    >
      {children}
    </OptionsContext.Provider>
  )
}
