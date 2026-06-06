import { useEffect, useRef } from 'react'
import WalletIcon from '../icons/Wallet'
import AppsIcon from '../icons/Apps'
import SettingsIcon from '../icons/Settings'
import CardReservationIcon from '../icons/CardReservation'
import SwapIcon from '../icons/Swap'

interface PillNavbarProps {
  activeTab: string
  onCardClick: () => void
  onTradeClick: () => void
  onWalletClick: () => void
  onAppsClick: () => void
  onSettingsClick: () => void
}

export default function PillNavbar({
  activeTab,
  onCardClick,
  onTradeClick,
  onWalletClick,
  onAppsClick,
  onSettingsClick,
}: PillNavbarProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const tradeRef = useRef<HTMLDivElement>(null)
  const walletRef = useRef<HTMLDivElement>(null)
  const appsRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ref =
      activeTab === 'card'
        ? cardRef
        : activeTab === 'trade'
          ? tradeRef
          : activeTab === 'wallet'
            ? walletRef
            : activeTab === 'apps'
              ? appsRef
              : activeTab === 'settings'
                ? settingsRef
                : null
    if (!ref?.current || activeTab === 'wallet') return
    const el = ref.current
    el.classList.remove('pill-icon-pop')
    void el.offsetWidth
    el.classList.add('pill-icon-pop')
    const handleEnd = () => el.classList.remove('pill-icon-pop')
    el.addEventListener('animationend', handleEnd)
    return () => el.removeEventListener('animationend', handleEnd)
  }, [activeTab])

  return (
    <nav className='pill-navbar' role='tablist' aria-label='Main navigation'>
      <button
        className={`pill-nav-btn ${activeTab === 'card' ? 'pill-nav-btn--active' : ''}`}
        onClick={onCardClick}
        role='tab'
        aria-selected={activeTab === 'card'}
        aria-label='Card'
        data-testid='tab-card'
      >
        <div ref={cardRef} className='pill-nav-icon'>
          <CardReservationIcon />
        </div>
        <span className='pill-nav-label'>Card</span>
      </button>
      <button
        className={`pill-nav-btn ${activeTab === 'trade' ? 'pill-nav-btn--active' : ''}`}
        onClick={onTradeClick}
        role='tab'
        aria-selected={activeTab === 'trade'}
        aria-label='Trade'
        data-testid='tab-trade'
      >
        <div ref={tradeRef} className='pill-nav-icon'>
          <SwapIcon />
        </div>
        <span className='pill-nav-label'>Trade</span>
      </button>
      <button
        className={`pill-nav-btn pill-nav-btn--wallet ${activeTab === 'wallet' ? 'pill-nav-btn--active' : ''}`}
        onClick={onWalletClick}
        role='tab'
        aria-selected={activeTab === 'wallet'}
        aria-label='Wallet'
        data-testid='tab-wallet'
      >
        <div ref={walletRef} className='pill-nav-icon pill-nav-logo-btn'>
          <img src='/arkade-icon.svg' alt='Wallet' style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
        </div>
      </button>
      <button
        className={`pill-nav-btn ${activeTab === 'apps' ? 'pill-nav-btn--active' : ''}`}
        onClick={onAppsClick}
        role='tab'
        aria-selected={activeTab === 'apps'}
        aria-label='Apps'
        data-testid='tab-apps'
      >
        <div ref={appsRef} className='pill-nav-icon'>
          <AppsIcon />
        </div>
        <span className='pill-nav-label'>Apps</span>
      </button>
      <button
        className={`pill-nav-btn ${activeTab === 'settings' ? 'pill-nav-btn--active' : ''}`}
        onClick={onSettingsClick}
        role='tab'
        aria-selected={activeTab === 'settings'}
        aria-label='Settings'
        data-testid='tab-settings'
      >
        <div ref={settingsRef} className='pill-nav-icon'>
          <SettingsIcon />
        </div>
        <span className='pill-nav-label'>Settings</span>
      </button>
    </nav>
  )
}
