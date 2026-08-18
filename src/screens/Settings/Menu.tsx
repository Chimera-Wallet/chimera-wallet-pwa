import { useContext } from 'react'
import Header from './Header'
import Content from '../../components/Content'
import { SettingsOptions } from '../../lib/types'
import Menu, { MenuRow, BadgeTone } from '../../components/Menu'
import { TextLabel } from '../../components/Text'
import FlexCol from '../../components/FlexCol'
import { OptionsContext } from '../../providers/options'
import { WalletContext } from '../../providers/wallet'
import { getStoredKycStatus, KycStatus } from '../../lib/kyc'
import KYCIcon from '../../icons/KYC'
import KnowledgeBaseIcon from '../../icons/KnowledgeBase'
import XIcon from '../../icons/X'
import AddressBookIcon from '../../icons/AddressBook'
import EyeIcon from '../../icons/Eye'
import KeyIcon from '../../icons/Key'
import GlobeOutlineIcon from '../../icons/GlobeOutline'
import CogIcon from '../../icons/Cog'
import NotificationIcon from '../../icons/Notification'
import PuzzleIcon from '../../icons/Puzzle'
import {useTranslation} from 'react-i18next'
import { T } from 'vitest/dist/chunks/reporters.d.BuRON0I0.js'

// map the stored KYC status to a status pill
function kycBadge(status: KycStatus): { text: string; tone: BadgeTone } {
  const {t} = useTranslation()
  switch (status) {
    case 'confirmed':
      return { text: t('settings.menu.verified'), tone: 'success' }
    case 'pending':
    case 'incomplete':
    case 'more_info_needed':
      return { text: t('settings.menu.pending'), tone: 'warning' }
    default:
      return { text: t('settings.menu.unverified'), tone: 'danger' }
  }
}

export default function SettingsMenu() {
  const { setOption } = useContext(OptionsContext)
  const { wallet } = useContext(WalletContext)
  const {t} = useTranslation()

  const accountRows: MenuRow[] = [
    { icon: <KYCIcon />, option: SettingsOptions.KYC, label: t('settings.menu.kycVer') , badge: kycBadge(getStoredKycStatus()) },
    { icon: <KnowledgeBaseIcon />, option: SettingsOptions.KnowledgeBase, label: t('settings.menu.knowledgeBase'), right: 'external' },
    { icon: <XIcon />, option: SettingsOptions.ManageAccount, label: t('settings.menu.manage'), right: 'external' },
    { icon: <AddressBookIcon />, option: SettingsOptions.AddressBook, label: t('settings.menu.addressBook') },
  ]

  const securityRows: MenuRow[] = [
    {
      icon: <EyeIcon size={20} />,
      option: SettingsOptions.Biometric,
      label: t('settings.biometric.bioAuth'),
      right: 'toggle',
      toggleChecked: wallet.lockedByBiometrics || false,
      onToggle: () => setOption(SettingsOptions.Biometric),
    },
    { icon: <KeyIcon size={20} />, option: SettingsOptions.SecretPhrase, label: t('settings.menu.showPhrase') },
  ]

  const appRows: MenuRow[] = [
    { icon: <GlobeOutlineIcon />, option: SettingsOptions.Language, label: t('settings.language.appLang') },
    { icon: <CogIcon />, option: SettingsOptions.Currency, label: t('settings.menu.currency') },
    { icon: <NotificationIcon />, option: SettingsOptions.Notifications, label: t('settings.menu.setNotifs') },
  ]

  const advancedRows: MenuRow[] = [
    { icon: <PuzzleIcon />, option: SettingsOptions.Advanced, label: t('settings.menu.advancedSettings') },
  ]

  return (
    <>
      <Header text='Settings' />
      <Content>
        <FlexCol gap='1.25rem'>
          <FlexCol gap='0'>
            <TextLabel>{t('common.general.account')}</TextLabel>
            <Menu rows={accountRows} />
          </FlexCol>
          <FlexCol gap='0'>
            <TextLabel>{t('common.general.security')}</TextLabel>
            <Menu rows={securityRows} />
          </FlexCol>
          <FlexCol gap='0'>
            <TextLabel>{t('common.general.app')}</TextLabel>
            <Menu rows={appRows} />
          </FlexCol>
          <FlexCol gap='0'>
            <TextLabel>{t('common.general.advanced')}</TextLabel>
            <Menu rows={advancedRows} />
          </FlexCol>
        </FlexCol>
      </Content>
    </>
  )
}
