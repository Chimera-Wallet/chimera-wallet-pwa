import Modal from './Modal'
import Button from './Button'
import FlexCol from './FlexCol'
import FlexRow from './FlexRow'
import OkIcon from '../icons/Ok'
import { useContext, useState } from 'react'
import NostrIcon from '../icons/Nostr'
import BoltzIcon from '../icons/Boltz'
import Text, { TextSecondary } from './Text'
import { ConfigContext } from '../providers/config'
import { OptionsContext } from '../providers/options'
import { SettingsOptions, Themes } from '../lib/types'
import LendasatIcon from '../screens/Apps/Lendasat/LendasatIcon'
import SatoraIcon from '../screens/Apps/Satora/SatoraIcon'
import { NavigationContext, Pages } from '../providers/navigation'
import { useTranslation } from 'react-i18next'

// icon with pretty gradient background
const PrettyIcon = ({ color, icon }: { color?: string; icon: React.ReactNode }) => {
  const { effectiveTheme } = useContext(ConfigContext)
  const defaultColor = effectiveTheme === Themes.Dark ? '#ffffff' : '#000000'
  const _color = color?.startsWith('#') ? color : defaultColor
  const circle = 'circle at 50% -70%'
  const gradient = [_color + 'dd 0%', _color + '00 70%']
  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        height: '100px',
        marginTop: '-1rem',
        alignItems: 'center',
        justifyContent: 'center',
        background: `radial-gradient(${circle}, ${gradient.join(', ')})`,
      }}
    >
      {icon}
    </div>
  )
}

const Tag = ({ text }: { text: string }) => (
  <div
    style={{
      fontWeight: 400,
      lineHeight: '140%',
      marginTop: '0.5rem',
      fontStyle: 'normal',
      fontSize: '0.75rem',
      borderRadius: '1000px',
      display: 'inline-block',
      padding: '0.25rem 0.75rem',
      color: 'var(--white)',
      backgroundColor: 'var(--blue-primary)',
    }}
  >
    Introducing: {text}
  </div>
)

const BulletPoint = ({ point }: { point: string[] }) => (
  <FlexRow alignItems='flex-start' gap='0.5rem'>
    <div style={{ paddingTop: '0.2rem' }}>
      <OkIcon />
    </div>
    <FlexCol gap='0'>
      <Text>{point[0] ?? ''}</Text>
      {point[1] ? <TextSecondary>{point[1]}</TextSecondary> : null}
    </FlexCol>
  </FlexRow>
)

const BulletList = ({ points }: { points: string[][] }) =>
  points ? (
    <FlexCol gap='0.5rem'>
      {points.map((point, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <BulletPoint key={`${point[0]}-${index}`} point={point} />
      ))}
    </FlexCol>
  ) : null

interface AnnouncementProps {
  page?: Pages
  title: string
  color?: string
  message: string
  close: () => void
  icon: React.ReactNode
  option?: SettingsOptions
  bulletPoints: string[][]
}

export default function Announcement({
  page,
  color,
  title,
  message,
  close,
  icon,
  option,
  bulletPoints,
}: AnnouncementProps) {
  const { navigate } = useContext(NavigationContext)
  const { setOption } = useContext(OptionsContext)
  const [open, setOpen] = useState(true)

  const {t} = useTranslation()


  const handleTryIt = () => {
    if (page) navigate(page)
    else if (option) {
      setOption(option)
      navigate(Pages.Settings)
    }
    close()
  }

  return (
    <Modal open={open} onOpenChange={setOpen} onExitComplete={close}>
      <div style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Note: the negative margin on the container is to offset the negative margin top of PrettyIcon class.*/}
        <div
          style={{ overflowY: 'auto', flex: '1 1 auto', minHeight: 0, marginTop: '-1rem', padding: '1rem 1rem 0 1rem' }}
        >
          <FlexCol gap='1.5rem'>
            <FlexCol centered>
              <PrettyIcon color={color} icon={icon} />
            </FlexCol>
            <FlexCol centered gap='0.5rem'>
              <Tag text={title} />
              <Text big medium centered wrap heading>
                {message}
              </Text>
            </FlexCol>
            <FlexCol gap='0.75rem'>
              <TextSecondary>{t('components.announcements.whatDo')}</TextSecondary>
              <BulletList points={bulletPoints} />
            </FlexCol>
          </FlexCol>
        </div>
        <FlexCol gap='0.25rem'>
          <Button onClick={handleTryIt} label={t('components.announcements.try', {title:title})} />
          <Button onClick={() => setOpen(false)} label={t('components.announcements.later')} secondary />
        </FlexCol>
      </div>
    </Modal>
  )
}

export function BoltzAnnouncement({ close }: { close: () => void }) {
  const {t} = useTranslation()

  return (
    <Announcement
      close={close}
      title='Boltz'
      color='#ffe96d'
      page={Pages.AppBoltz}
      icon={<BoltzIcon big />}
      message={t('components.announcements.lightWork')}
      bulletPoints={[
        [t('components.announcements.bridge'), t('components.announcements.bridgeDescr')],
        [t('components.announcements.fast'), t('components.announcements.fastDescr')],
        [t('components.announcements.safe'), t('components.announcements.safeDescr')],
      ]}
    />
  )
}

export function LendaSatAnnouncement({ close }: { close: () => void }) {
  const {t} = useTranslation()

  return (
    <Announcement
      close={close}
      title='LendaSat'
      page={Pages.AppLendasat}
      icon={<LendasatIcon big />}
      message={t('components.announcements.lendaMess')}
      bulletPoints={[
        [
          t('components.announcements.chooseLoan'),
          t('components.announcements.chooseLoanDescr'),
        ],
        [
          t('components.announcements.lock'),
          t('components.announcements.lockDescr'),
        ],
        [
          t('components.announcements.rcv'),
          t('components.announcements.rcvDescr'),
        ],
      ]}
    />
  )
}

export function SatoraAnnouncement({ close }: { close: () => void }) {
  const {t} = useTranslation()

  return (
    <Announcement
      close={close}
      title='Satora'
      page={Pages.AppSatora}
      icon={<SatoraIcon big />}
      message={t('components.announcements.satoraMessage')}
      bulletPoints={[
        [t('components.announcements.swapStable'), t('components.announcements.swapDescr')],
        [
          t('components.announcements.atomic'),
          t('components.announcements.atomicDescr'),
        ],
        [t('components.announcements.selfCust'), t('components.announcements.selfCustDescr')],
      ]}
    />
  )
}

export function NostrBackupsAnnouncement({ close }: { close: () => void }) {
  const {t} = useTranslation()

  return (
    <Announcement
      close={close}
      title={t('components.announcements.nostrBack')}
      option={SettingsOptions.Backup}
      icon={<NostrIcon big />}
      message={t('components.announcements.nostrMsg')}
      bulletPoints={[
        [t('components.announcements.backSett'), t('components.announcements.backMsg')],
        [t('components.announcements.boltzSw'), t('components.announcements.boltzMsg')],
        [t('components.announcements.secure'), t('components.announcements.secureMsg')],
      ]}
    />
  )
}
