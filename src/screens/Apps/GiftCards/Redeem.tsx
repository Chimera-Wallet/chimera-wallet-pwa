/**
 * Gift Card Redeem Screen
 *
 * Redeems a gift card code for crypto sent to the user's own Ark wallet
 * address, via ramp-system's GET /gift-card/:code (lookup) and
 * POST /gift-card/redeem (destination_type=crypto).
 *
 * ramp-system's redeem endpoint also supports sepa/swift/us bank-payout
 * redemption, but that's not exposed here — this screen covers the
 * wallet-native case (redeem straight into your own balance).
 */

import { useContext, useEffect, useState } from 'react'
import Content from '../../../components/Content'
import FlexCol from '../../../components/FlexCol'
import Header from '../../../components/Header'
import Padded from '../../../components/Padded'
import Text, { TextSecondary } from '../../../components/Text'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import Shadow from '../../../components/Shadow'
import ErrorMessage from '../../../components/Error'
import Info from '../../../components/Info'
import AssetSelector from '../../../components/AssetSelector'
import CheckMarkIcon from '../../../icons/CheckMark'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { WalletContext } from '../../../providers/wallet'
import { getGiftCard, redeemGiftCard, type RampGiftCard } from '../../../providers/ramp'
import { getReceivingAddresses } from '../../../lib/asp'
import { getUserEmailForBankTransfer } from '../../../lib/kyc'
import { requireAssetConfig, type AssetSymbol } from '../../../lib/assets'

export default function GiftCardRedeem() {
  const { navigate, goBack } = useContext(NavigationContext)
  const { svcWallet } = useContext(WalletContext)

  const [code, setCode] = useState('')
  const [card, setCard] = useState<RampGiftCard | null>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<AssetSymbol>('BTC')
  const [arkAddress, setArkAddress] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  const [redeemed, setRedeemed] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadAddress = async () => {
      if (!svcWallet) return
      try {
        const addresses = await getReceivingAddresses(svcWallet)
        setArkAddress(addresses.offchainAddr)
      } catch (err) {
        console.error('Failed to load Ark address:', err)
      }
    }
    loadAddress()
  }, [svcWallet])

  const handleLookup = async () => {
    if (!code.trim()) return
    try {
      setLookingUp(true)
      setError('')
      setCard(await getGiftCard(code.trim()))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gift card not found')
      setCard(null)
    } finally {
      setLookingUp(false)
    }
  }

  const handleRedeem = async () => {
    if (!card) return
    if (!arkAddress) {
      setError('Unable to get your wallet address')
      return
    }

    try {
      setRedeeming(true)
      setError('')
      await redeemGiftCard({
        code: code.trim(),
        email: getUserEmailForBankTransfer(),
        asset: requireAssetConfig(selectedAsset).symbol,
        destination_type: 'crypto',
        destination_crypto_address: arkAddress,
      })
      setRedeemed(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to redeem gift card')
    } finally {
      setRedeeming(false)
    }
  }

  if (redeemed) {
    return (
      <>
        <Header text='Gift Card' back={goBack} />
        <Content>
          <Padded>
            <FlexCol gap='1.5rem'>
              <Info color='green' icon={<CheckMarkIcon small />} title='Redemption Submitted'>
                <TextSecondary>
                  Your {selectedAsset} is on its way to your wallet. It may take a few minutes to arrive.
                </TextSecondary>
              </Info>
            </FlexCol>
          </Padded>
        </Content>
        <ButtonsOnBottom>
          <Button label='Done' onClick={() => navigate(Pages.AppGiftCards)} />
        </ButtonsOnBottom>
      </>
    )
  }

  return (
    <>
      <Header text='Redeem a Gift Card' back={goBack} />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
            <ErrorMessage error={Boolean(error)} text={error} />

            <FlexCol gap='0.5rem'>
              <Shadow input>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <Text tiny color='neutral-500'>
                    Gift Card Code
                  </Text>
                  <input
                    type='text'
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value)
                      setCard(null)
                    }}
                    placeholder='abc-def-gh2k'
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--white)',
                      fontSize: '1rem',
                      outline: 'none',
                    }}
                  />
                </div>
              </Shadow>
            </FlexCol>

            {!card ? (
              <Button label={lookingUp ? 'Looking up...' : 'Check Code'} onClick={handleLookup} disabled={!code.trim() || lookingUp} loading={lookingUp} secondary />
            ) : (
              <FlexCol gap='1rem'>
                <Shadow fat>
                  <FlexCol gap='0.5rem'>
                    <Text bold>
                      {card.amount} {card.fiat_currency}
                    </Text>
                    <TextSecondary small>
                      {!card.active ? 'Not yet active — awaiting purchase payment' : card.redeemed ? 'Already redeemed' : 'Ready to redeem'}
                    </TextSecondary>
                  </FlexCol>
                </Shadow>

                {card.active && !card.redeemed ? (
                  <>
                    <FlexCol gap='0.5rem'>
                      <Text tiny color='neutral-500'>
                        Receive as
                      </Text>
                      <AssetSelector label='' selected={selectedAsset} onSelect={setSelectedAsset} />
                    </FlexCol>
                  </>
                ) : null}
              </FlexCol>
            )}
          </FlexCol>
        </Padded>
      </Content>
      {card && card.active && !card.redeemed ? (
        <ButtonsOnBottom>
          <Button
            label={redeeming ? 'Redeeming...' : 'Redeem to My Wallet'}
            onClick={handleRedeem}
            disabled={redeeming || !arkAddress}
            loading={redeeming}
          />
        </ButtonsOnBottom>
      ) : null}
    </>
  )
}
