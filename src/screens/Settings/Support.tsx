import { useContext, useEffect, useState } from 'react'
import Header from './Header'
import Content from '../../components/Content'
import Padded from '../../components/Padded'
import FlexCol from '../../components/FlexCol'
import Text, { TextSecondary } from '../../components/Text'
import Button from '../../components/Button'
import { WalletContext } from '../../providers/wallet'
import { ConfigContext } from '../../providers/config'
import { AspContext } from '../../providers/asp'
import { SwapsContext } from '../../providers/swaps'
import { getReceivingAddresses } from '../../lib/asp'
import { Addresses } from '../../lib/types'
import { getWebExplorerURL } from '../../lib/explorers'
import { NetworkName } from '@arkade-os/sdk'
import ChatwootWidget from '../../components/ChatWoot'
import ButtonsOnBottom from '../../components/ButtonsOnBottom'
import ErrorMessage from '../../components/Error'
import { hasChatwootVars } from '../../lib/chatwoot'
import { getDefaultAddress } from '../../lib/address'
import { gitCommit } from '../../_gitCommit'
import {useTranslation} from 'react-i18next'

export default function Support() {
  const { aspInfo } = useContext(AspContext)
  const { config } = useContext(ConfigContext)
  const { getApiUrl } = useContext(SwapsContext)
  const { wallet, svcWallet } = useContext(WalletContext)

  const {t} = useTranslation()

  const [error, setError] = useState('')
  const [addresses, setAddresses] = useState<Addresses>()
  const [supportChatLoaded, setSupportChatLoaded] = useState(false)

  // Fetch wallet addresses
  useEffect(() => {
    if (svcWallet) {
      getReceivingAddresses(svcWallet)
        .then(setAddresses)
        .catch((err) => console.error('Failed to get addresses:', err))
    }
  }, [svcWallet])

  // Wait for Chatwoot to load, show error after 5 seconds if not loaded
  useEffect(() => {
    // If Chatwoot is already loaded, set state immediately
    if (window.$chatwoot) {
      window.$chatwoot?.toggleBubbleVisibility('hide')
      setSupportChatLoaded(true)
      return
    }

    // Not all networks may have Chatwoot configured, check for required vars before waiting
    if (!hasChatwootVars()) return setError(t('errors.support.notConfigured'))

    // Timeout to detect if Chatwoot fails to load
    const loadTimeout = setTimeout(() => {
      if (!supportChatLoaded) setError(t('errors.support.failedLoad'))
    }, 5_000)

    // Listen for Chatwoot ready event to set loaded state
    const eventHandler = () => {
      clearTimeout(loadTimeout)
      setSupportChatLoaded(true)
      window.$chatwoot?.toggleBubbleVisibility('hide')
    }

    const event = 'chatwoot:ready'
    window.addEventListener(event, eventHandler)

    return () => {
      clearTimeout(loadTimeout)
      window.removeEventListener(event, eventHandler)
    }
  }, [])

  // Set Chatwoot user and custom attributes when addresses are available
  useEffect(() => {
    if (!addresses || !window.$chatwoot || !wallet.pubkey) return

    // Set user identifier (using wallet pubkey)
    const userIdentifier = wallet.pubkey.substring(0, 16)
    window.$chatwoot.setUser(userIdentifier, { name: `User ${userIdentifier}` })

    const defaultAddress = getDefaultAddress(wallet.pubkey, aspInfo)

    // Set custom attributes including addresses and service URLs
    window.$chatwoot.setCustomAttributes({
      wallet_pubkey: wallet.pubkey,
      network: wallet.network || t('errors.support.unavailable'),
      location_origin: window.location.origin,
      default_address: defaultAddress,
      ark_address: addresses.offchainAddr || t('errors.support.unavailable'),
      boltz_url: getApiUrl() || t('errors.support.unavailable'),
      indexer_url: aspInfo.url || config.aspUrl || t('errors.support.unavailable'),
      btc_boarding_address: addresses.boardingAddr || t('errors.support.unavailable'),
      ark_server_url: aspInfo.url || config.aspUrl || t('errors.support.unavailable'),
      app_version: import.meta.env.VITE_APP_VERSION || t('errors.support.unavailable'),
      lendasat_url: import.meta.env.VITE_LENDASAT_IFRAME_URL || t('errors.support.unavailable'),
      satora_url: import.meta.env.VITE_SATORA_IFRAME_URL || t('errors.support.unavailable'),
      explorer_url: wallet.network ? getWebExplorerURL(wallet.network as NetworkName) : t('errors.support.unavailable'),
      git_commit: gitCommit,
    })
  }, [addresses, wallet.pubkey, supportChatLoaded])

  const handleOpenChat = () => {
    if (window.$chatwoot) window.$chatwoot.toggle('open')
  }

  const Section = ({ title, text }: { title: string; text: string }) => (
    <FlexCol gap='0.5rem'>
      <Text thin>{title}</Text>
      <TextSecondary>{text}</TextSecondary>
    </FlexCol>
  )

  return (
    <>
      <Header text='Support' back />
      <Content>
        <Padded>
          <FlexCol gap='1rem'>
            <ErrorMessage error={Boolean(error)} text={error} />
            <Section
              title={t('settings.support.custSupp')}
              text={t('settings.support.custSuppText')}
            />
            <Section
              title={t('settings.support.secure')}
              text={t('settings.support.secureText')}
            />
            <Section
              title={t('settings.support.bugRep')}
              text={t('settings.support.bugRepText')}
            />
            <Section
              title={t('settings.support.progress')}
              text={t('settings.support.progressText')}
            />
            <ChatwootWidget />
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        {error ? null : (
          <Button
            onClick={handleOpenChat}
            disabled={!supportChatLoaded}
            label={supportChatLoaded ? t('settings.support.openSupp') : t('common.settings.loading')}
          />
        )}
      </ButtonsOnBottom>
    </>
  )
}
