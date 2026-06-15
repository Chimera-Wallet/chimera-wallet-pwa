import { useContext } from 'react'
import Content from '../../components/Content'
import Padded from '../../components/Padded'
import Header from '../../components/Header'
import Text from '../../components/Text'
import Shadow from '../../components/Shadow'
import { NavigationContext, Pages } from '../../providers/navigation'
import LendasatIcon from './Lendasat/LendasatIcon'
import SatoraIcon from './Satora/SatoraIcon'
import Focusable from '../../components/Focusable'
import { hapticSubtle } from '../../lib/haptics'

interface AppProps {
  icon?: React.ReactElement
  image?: string
  name: string
  link?: string
  page?: Pages
  comingSoon?: boolean
}

function App({ icon, image, link, name, page, comingSoon }: AppProps) {
  const { navigate } = useContext(NavigationContext)

  const handleClick = () => {
    if (comingSoon) return
    hapticSubtle()
    if (typeof page !== 'undefined') return navigate(page)
    if (link) window.open(link, '_blank')
  }

  const testId = `app-${name.toLowerCase().replace(/\s+/g, '-')}`

  const contentStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100px',
    padding: '0.75rem',
    gap: '0.5rem',
  }

  return (
    <Focusable onEnter={handleClick} ariaLabel={name}>
      <Shadow border onClick={handleClick}>
        <div style={contentStyle} data-testid={testId}>
          {image ? (
            <img
              src={image}
              alt={`${name} icon`}
              style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'contain' }}
            />
          ) : icon ? (
            <div
              style={{
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: 'scale(0.7)',
              }}
            >
              {icon}
            </div>
          ) : null}

          <Text bold centered>
            {name}
          </Text>

          {comingSoon ? (
            <div
              style={{
                padding: '2px 8px',
                backgroundColor: 'var(--neutral-200)',
                borderRadius: 12,
                fontSize: 10,
                color: 'var(--fg)',
                fontWeight: 500,
              }}
            >
              Coming Soon
            </div>
          ) : null}
        </div>
      </Shadow>
    </Focusable>
  )
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  width: '100%',
  gap: '0.5rem',
}

export default function Apps() {
  return (
    <>
      <Header text='Apps' />
      <Content>
        <Padded>
          <div style={gridStyle}>
            <App name='Swap' image='/images/apps/Transfer.svg' page={Pages.AppSwap} />
            <App name='Address Book' image='/images/apps/AddressBook.svg' page={Pages.AppAddressBook} />
            <App name='Statement' image='/images/apps/Statement.svg' page={Pages.AppStatement} />
            <App name='Referral' image='/images/apps/Referral.svg' page={Pages.AppReferral} />
            <App name='Gift Cards' image='/images/apps/GiftCards.svg' page={Pages.AppGiftCards} />
            <App name='Card Reservation' image='/images/apps/CardReservation.svg' page={Pages.AppCardReservation} />
            <App name='Staking' image='/images/apps/Transfer.svg' comingSoon />
          </div>

          <div style={{ marginTop: '2rem', marginBottom: '1rem' }}>
            <Text bold large>
              Third Party Apps
            </Text>
          </div>

          <div style={gridStyle}>
            <App name='LendaSat' icon={<LendasatIcon />} link='https://lendasat.com' page={Pages.AppLendasat} />
            <App name='Satora' icon={<SatoraIcon />} page={Pages.AppSatora} />
          </div>
        </Padded>
      </Content>
    </>
  )
}
