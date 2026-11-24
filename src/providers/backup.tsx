import { Config } from '../lib/types'
import { ConfigContext } from './config'
import { consoleError } from '@/lib/logs'
import { BackupProvider as NostrBackup } from '@/lib/backup'
import { getAddressBook, getDeletedAddressIds, onAddressBookChange } from '@/lib/addressBook'
import { readSolverCardsFromStorage } from '@/lib/storage'
import { ReactNode, createContext, useContext, useEffect, useRef } from 'react'

/**
 * Keeps the Nostr backup current for data that changes outside the settings
 * screens. The backup itself (format, merging, restore) lives in lib/backup.ts;
 * this only decides when to write. Every write is skipped while backups are
 * off or before the wallet has a pubkey.
 */
type BackupContextProps = {
  /** Back up everything at once, e.g. when backups are switched on. */
  fullBackup: (config: Config) => Promise<void>
  /** Back up every network's solver cards as stored on this device. */
  backupSolverCards: () => Promise<void>
}

export const BackupContext = createContext<BackupContextProps>({
  fullBackup: async () => {},
  backupSolverCards: async () => {},
})

const backupFor = (config: Config): NostrBackup | null =>
  config.nostrBackup && config.pubkey ? new NostrBackup({ pubkey: config.pubkey }) : null

export const BackupProvider = ({ children }: { children: ReactNode }) => {
  const { config } = useContext(ConfigContext)

  // The address book listener outlives renders, so it reads config from a ref
  const configRef = useRef(config)
  useEffect(() => {
    configRef.current = config
  }, [config])

  useEffect(
    () =>
      onAddressBookChange((entries) => {
        backupFor(configRef.current)
          ?.backupAddressBook(entries, getDeletedAddressIds())
          .catch((err) => consoleError(err, 'Failed to back up address book'))
      }),
    [],
  )

  const fullBackup = async (config: Config) => {
    // Called while switching backups on, so don't wait for the config flag
    if (!config.pubkey) return
    await new NostrBackup({ pubkey: config.pubkey }).fullBackup({
      config,
      addressBook: getAddressBook(),
      addressBookDeleted: getDeletedAddressIds(),
      solverCards: readSolverCardsFromStorage(),
    })
  }

  const backupSolverCards = async () => {
    await backupFor(configRef.current)?.backupSolverCards(readSolverCardsFromStorage())
  }

  return <BackupContext.Provider value={{ fullBackup, backupSolverCards }}>{children}</BackupContext.Provider>
}
