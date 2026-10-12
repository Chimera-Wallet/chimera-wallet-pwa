import { useState, useContext, useEffect } from 'react'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { WalletContext } from '../../../providers/wallet'
import { getBankTransferProvider } from '../../../providers/bankTransfer'
import { getReceivingAddresses } from '../../../lib/asp'
import { getKycEmail } from '../../../lib/kyc'
import AppWebView from '../AppWebView'
import Header from '../../../components/Header'
import Content from '../../../components/Content'
import Padded from '../../../components/Padded'
import FlexCol from '../../../components/FlexCol'
import Button from '../../../components/Button'
import {useTranslation} from 'react-i18next'

// Gift cards follow the same backend switch as bank transfers: the native
// Purchase/Redeem screens talk to ramp-system, which isn't live everywhere yet.
// On the legacy 'chimera' provider they open the hosted gift card site instead.
// A missing URL leaves AppWebView showing "app unavailable", not a guessed site.
const BUY_URL = import.meta.env.VITE_GIFT_CARDS_BUY_URL ?? ''
const REDEEM_BASE_URL = import.meta.env.VITE_GIFT_CARDS_REDEEM_URL ?? ''

export default function AppGiftCards() {
  const { navigate } = useContext(NavigationContext)
  const { svcWallet } = useContext(WalletContext)
  const [webviewUrl, setWebviewUrl] = useState<string | null>(null)
  const [offchainAddr, setOffchainAddr] = useState('')

  const useRamp = getBankTransferProvider() === 'ramp'

  useEffect(() => {
    if (useRamp || !svcWallet) return
    getReceivingAddresses(svcWallet)
      .then(({ offchainAddr }) => setOffchainAddr(offchainAddr))
      .catch(console.error)
  }, [useRamp, svcWallet])

  const handleBack = () => navigate(Pages.Apps)

  const  {t} = useTranslation()

  const handleBuy = () => {
    if (useRamp) return navigate(Pages.AppGiftCardPurchase)
    setWebviewUrl(BUY_URL)
  }

  const handleRedeem = () => {
    if (useRamp) return navigate(Pages.AppGiftCardRedeem)
    const params = new URLSearchParams()
    params.set('email', getKycEmail() ?? '')
    params.set('destination', offchainAddr)
    setWebviewUrl(REDEEM_BASE_URL ? `${REDEEM_BASE_URL}?${params.toString()}` : '')
  }

  if (webviewUrl !== null) {
    return <AppWebView appName={t('apps.giftCards.giftCards')} url={webviewUrl} onBack={() => setWebviewUrl(null)} />
  }

  return (
    <>
      <Header text={t('apps.giftCards.giftCards')} back={handleBack} />
      <Content>
        <Padded>
          <FlexCol>
            <Button label={t('apps.giftCards.buy')} onClick={handleBuy} />
            <Button label={t('apps.giftCards.redeem')} onClick={handleRedeem} disabled={!useRamp && !offchainAddr} />
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
