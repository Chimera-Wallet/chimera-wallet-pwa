import { useState, useContext, useEffect } from 'react'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { WalletContext } from '../../../providers/wallet'
import { getReceivingAddresses } from '../../../lib/asp'
import { getKycEmail } from '../../../lib/kyc'
import AppWebView from '../AppWebView'
import Header from '../../../components/Header'
import Content from '../../../components/Content'
import Padded from '../../../components/Padded'
import FlexCol from '../../../components/FlexCol'
import Button from '../../../components/Button'

type Step = 'select' | 'webview'

const BUY_URL = import.meta.env.VITE_GIFT_CARDS_BUY_URL ?? ''
const REDEEM_BASE_URL = import.meta.env.VITE_GIFT_CARDS_REDEEM_URL ?? ''

export default function AppGiftCards() {
  const { navigate } = useContext(NavigationContext)
  const { svcWallet } = useContext(WalletContext)
  const [step, setStep] = useState<Step>('select')
  const [webviewUrl, setWebviewUrl] = useState('')
  const [offchainAddr, setOffchainAddr] = useState('')

  useEffect(() => {
    if (!svcWallet) return
    getReceivingAddresses(svcWallet)
      .then(({ offchainAddr }) => setOffchainAddr(offchainAddr))
      .catch(console.error)
  }, [svcWallet])

  const handleBack = () => navigate(Pages.Apps)

  const handleBuy = () => {
    setWebviewUrl(BUY_URL)
    setStep('webview')
  }

  const handleRedeem = () => {
    const email = getKycEmail() ?? ''
    const params = new URLSearchParams()
    params.set('email', email)
    params.set('destination', offchainAddr)
    setWebviewUrl(REDEEM_BASE_URL ? `${REDEEM_BASE_URL}?${params.toString()}` : '')
    setStep('webview')
  }

  if (step === 'webview') {
    return <AppWebView appName='Gift Cards' url={webviewUrl} onBack={() => setStep('select')} />
  }

  return (
    <>
      <Header text='Gift Cards' back={handleBack} />
      <Content>
        <Padded>
          <FlexCol>
            <Button label='Buy a new gift card' onClick={handleBuy} />
            <Button label='Redeem gift card' onClick={handleRedeem} />
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
