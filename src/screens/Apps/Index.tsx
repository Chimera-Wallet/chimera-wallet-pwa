import { useContext } from 'react'
import Content from '../../components/Content'
import Padded from '../../components/Padded'
import Header from '../../components/Header'
import Text from '../../components/Text'
import Shadow from '../../components/Shadow'
import { NavigationContext, Pages } from '../../providers/navigation'
import Focusable from '../../components/Focusable'
import LendasatIcon from './Lendasat/LendasatIcon'
import LendaswapIcon from './Lendaswap/LendaswapIcon'
import { hapticSubtle } from '../../lib/haptics'

interface AppProps {
  icon?: React.ReactElement
  image?: string
  name: string
  link?: string
  page?: Pages
  backgroundImage?: string
  comingSoon?: boolean
}

function App({ icon, image, link, name, page, backgroundImage, comingSoon }: AppProps) {
  const { navigate } = useContext(NavigationContext)

  const handleClick = () => {
    if (comingSoon) return
    hapticSubtle()
    if (typeof page !== 'undefined') return navigate(page)
    if (link) window.open(link, '_blank')
  }

  const testId = `app-${name.toLowerCase().replace(/\s+/g, '-')}`

  const cardStyle: React.CSSProperties = {
    position: 'relative',
    minHeight: '100px',
    backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  }

  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: backgroundImage ? 'rgba(0, 0, 0, 0.3)' : 'transparent',
    borderRadius: '0.5rem',
  }

  const contentStyle: React.CSSProperties = {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100px',
  }

  return (
    <Focusable onEnter={handleClick}>
      <Shadow border onClick={handleClick}>
        <div style={cardStyle}>
          {backgroundImage ? <div style={overlayStyle} /> : null}
          <div style={contentStyle} data-testid={testId}>
            {/* Icon centered */}
            {image ? (
              <img
                src={image}
                alt={`${name} icon`}
                style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'contain' }}
              />
            ) : (
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
            )}

            {/* Title */}
            <Text bold centered>
              {name}
            </Text>

            {/* Coming Soon tag */}
            {comingSoon ? (
              <div
                style={{
                  marginTop: 4,
                  padding: '2px 8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: 12,
                  fontSize: 10,
                  color: '#fff',
                  fontWeight: 500,
                }}
              >
                Coming Soon
              </div>
            ) : null}
          </div>
        </div>
      </Shadow>
    </Focusable>
  )
}

export default function Apps() {
  return (
    <>
      <Header text='Apps' />
      <Content>
        <Padded>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              width: '100%',
            }}
          >
            <App
              name='Swap'
              image='/images/apps/Transfer.svg'
              page={Pages.AppSwap}
              backgroundImage='/images/apps_backgrounds/transfer.png'
            />

            <App
              name='Address Book'
              image='/images/apps/AddressBook.svg'
              page={Pages.AppAddressBook}
              backgroundImage='/images/apps_backgrounds/address_book.png'
            />

            <App
              name='Statement'
              image='/images/apps/Statement.svg'
              page={Pages.AppStatement}
              backgroundImage='/images/apps_backgrounds/statements.png'
            />

            <App
              name='Referral'
              image='/images/apps/Referral.svg'
              page={Pages.AppReferral}
              backgroundImage='/images/apps_backgrounds/referral.png'
            />

            <App
              name='Gift Cards'
              image='/images/apps/GiftCards.svg'
              page={Pages.AppGiftCards}
              backgroundImage='/images/apps_backgrounds/gift_cards.png'
            />

            <App
              name='Card Reservation'
              image='/images/apps/CardReservation.svg'
              page={Pages.AppCardReservation}
              backgroundImage='/images/apps_backgrounds/card_reservation.png'
            />

            <App
              name='Staking'
              image='/images/apps/Transfer.svg'
              backgroundImage='/images/apps_backgrounds/transfer.png'
              comingSoon
            />
          </div>

          {/* Third Party Apps Section */}
          <div style={{ marginTop: '2rem', marginBottom: '1rem' }}>
            <Text bold large>
              Third Party Apps
            </Text>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              width: '100%',
            }}
          >
            {/* 
            <App
              name='Boltz'
              icon={<BoltzIcon />}
              desc='Swap instantly between Arkade and Lightning'
              link='https://boltz.exchange/'
              page={Pages.AppBoltz}
              live
            /> */}

            <App
              name='LendaSat'
              icon={<LendasatIcon />}
              link='https://lendasat.com'
              page={Pages.AppLendasat}
              backgroundImage='/images/apps_backgrounds/transfer.png'
            />

            <App
              name='LendaSwap'
              icon={<LendaswapIcon />}
              link='https://swap.lendasat.com'
              page={Pages.AppLendaswap}
              backgroundImage='/images/apps_backgrounds/transfer.png'
            />
          </div>
        </Padded>
      </Content>
    </>
  )
}
