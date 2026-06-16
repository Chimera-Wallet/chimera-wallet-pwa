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

// map the stored KYC status to a status pill
function kycBadge(status: KycStatus): { text: string; tone: BadgeTone } {
  switch (status) {
    case 'confirmed':
      return { text: 'Verified', tone: 'success' }
    case 'pending':
    case 'incomplete':
    case 'more_info_needed':
      return { text: 'Pending', tone: 'warning' }
    default:
      return { text: 'Not Verified', tone: 'danger' }
  }
}

export default function SettingsMenu() {
  const { setOption } = useContext(OptionsContext)
  const { wallet } = useContext(WalletContext)

  const accountRows: MenuRow[] = [
    { icon: <KYCIcon />, option: SettingsOptions.KYC, label: 'KYC - Verification', badge: kycBadge(getStoredKycStatus()) },
    { icon: <KnowledgeBaseIcon />, option: SettingsOptions.KnowledgeBase, label: 'Knowledge Base', right: 'external' },
    { icon: <XIcon />, option: SettingsOptions.ManageAccount, label: 'Manage Account', right: 'external' },
    { icon: <AddressBookIcon />, option: SettingsOptions.AddressBook, label: 'Address Book' },
  ]

  const securityRows: MenuRow[] = [
    {
      icon: <EyeIcon size={20} />,
      option: SettingsOptions.Biometric,
      label: 'Biometric Authentication',
      right: 'toggle',
      toggleChecked: wallet.lockedByBiometrics || false,
      onToggle: () => setOption(SettingsOptions.Biometric),
    },
    { icon: <KeyIcon size={20} />, option: SettingsOptions.SecretPhrase, label: 'Show Secret Phrase' },
  ]

  const appRows: MenuRow[] = [
    { icon: <GlobeOutlineIcon />, option: SettingsOptions.Language, label: 'App Language' },
    { icon: <CogIcon />, option: SettingsOptions.Currency, label: 'Currency' },
    { icon: <NotificationIcon />, option: SettingsOptions.Notifications, label: 'Set Notifications' },
  ]

  const advancedRows: MenuRow[] = [
    { icon: <PuzzleIcon />, option: SettingsOptions.Advanced, label: 'Advanced Settings' },
  ]

  return (
    <>
      <Header text='Settings' />
      <Content>
        <FlexCol gap='1.25rem'>
          <FlexCol gap='0'>
            <TextLabel>Account</TextLabel>
            <Menu rows={accountRows} />
          </FlexCol>
          <FlexCol gap='0'>
            <TextLabel>Security</TextLabel>
            <Menu rows={securityRows} />
          </FlexCol>
          <FlexCol gap='0'>
            <TextLabel>App</TextLabel>
            <Menu rows={appRows} />
          </FlexCol>
          <FlexCol gap='0'>
            <TextLabel>Advanced</TextLabel>
            <Menu rows={advancedRows} />
          </FlexCol>
        </FlexCol>
      </Content>
    </>
  )
}
