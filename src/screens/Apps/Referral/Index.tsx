import { useCallback, useContext, useEffect, useState } from 'react'
import { ConfigContext } from '../../../providers/config'
import { WalletContext } from '../../../providers/wallet'
import { FiatContext } from '../../../providers/fiat'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { getAppConfig } from '../../../lib/appConfig'
import { fetchKycStatus, getStoredKycStatus } from '../../../lib/kyc'
import { fromSatoshis } from '../../../lib/format'
import { useReferral } from '../../../hooks/useReferral'
import AppInfoPage from '../AppInfoPage'
import Header from '../../../components/Header'
import Content from '../../../components/Content'
import Padded from '../../../components/Padded'
import FlexCol from '../../../components/FlexCol'
import FlexRow from '../../../components/FlexRow'
import Text from '../../../components/Text'
import Button from '../../../components/Button'
import Loading from '../../../components/Loading'

type Step = 'info' | 'main'

const MIN_CLAIM_AMOUNT_CHF = 10

export default function AppReferral() {
  const { config, updateConfig } = useContext(ConfigContext)
  const { navigate } = useContext(NavigationContext)
  const { svcWallet } = useContext(WalletContext)
  const { fromCurrency, toCurrency } = useContext(FiatContext)

  const [step, setStep] = useState<Step>(config.referralSlideShowSeen ? 'main' : 'info')
  const [kycConfirmed, setKycConfirmed] = useState<boolean | null>(null)

  const { link, rewardChf, isLoading, error, refetch, claim, claiming, claimError, claimSuccess } = useReferral()

  // Check KYC status on mount when in main step
  useEffect(() => {
    if (step !== 'main') return
    const stored = getStoredKycStatus()
    if (stored === 'confirmed') {
      setKycConfirmed(true)
      return
    }
    setKycConfirmed(null)
    fetchKycStatus().then(({ status }) => {
      setKycConfirmed(status === 'confirmed')
    })
  }, [step])

  const handleInfoContinue = useCallback(() => {
    updateConfig({ ...config, referralSlideShowSeen: true })
    setStep('main')
  }, [config, updateConfig])

  const handleBack = useCallback(() => {
    navigate(Pages.Apps)
  }, [navigate])

  const handleClaim = useCallback(async () => {
    if (!svcWallet) return
    const address = await svcWallet.getAddress()
    await claim(address)
  }, [svcWallet, claim])

  if (step === 'info') {
    const appConfig = getAppConfig('referral')
    const slides = appConfig?.infoSlides ?? []
    return <AppInfoPage appName='Referral' slides={slides} onContinue={handleInfoContinue} onBack={handleBack} />
  }

  // Main referral screen
  const rewardSats = rewardChf != null ? fromCurrency(rewardChf, 'chf') : null
  const rewardBtc = rewardSats != null ? fromSatoshis(rewardSats) : null
  const rewardFiat = rewardSats != null ? toCurrency(rewardSats, config.fiat) : null
  const canClaim = rewardChf != null && rewardChf >= MIN_CLAIM_AMOUNT_CHF

  return (
    <>
      <Header text='Referral' back={handleBack} />
      <Content>
        <Padded>
          {kycConfirmed === null ? (
            <Loading simple />
          ) : !kycConfirmed ? (
            <FlexCol gap='1.5rem'>
              <Text bold large centered>
                Identity Verification Required
              </Text>
              <Text centered wrap>
                To access the Referral Program and earn rewards, you need to complete identity verification first.
              </Text>
              <Button label='Go to Verification' onClick={() => navigate(Pages.SettingsKYC)} />
            </FlexCol>
          ) : (
            <FlexCol gap='2rem'>
              {/* Reward balance */}
              <FlexCol gap='0.5rem'>
                <Text bold>Your Reward Balance</Text>
                {isLoading ? (
                  <Loading simple />
                ) : error ? (
                  <Text small>{error}</Text>
                ) : (
                  <>
                    <Text big bold>
                      {rewardFiat != null ? `${rewardFiat.toFixed(2)} ${config.fiat}` : '— ' + config.fiat}
                    </Text>
                    <Text small>{rewardBtc != null ? `${rewardBtc.toFixed(8)} BTC` : '—'}</Text>
                  </>
                )}
              </FlexCol>

              {/* Claim button */}
              <FlexCol gap='0.5rem'>
                {claimSuccess ? <Text centered>Reward claimed successfully!</Text> : null}
                {claimError ? <Text centered>{claimError}</Text> : null}
                <Button
                  label='Claim Reward'
                  disabled={!canClaim || claiming || !svcWallet}
                  loading={claiming}
                  onClick={handleClaim}
                />
                {!canClaim && !isLoading && (
                  <Text small centered>
                    Minimum {MIN_CLAIM_AMOUNT_CHF} CHF required to claim
                  </Text>
                )}
              </FlexCol>

              {/* Referral link */}
              {link ? (
                <FlexCol gap='0.5rem'>
                  <Text bold>Your Referral Link</Text>
                  <div
                    style={{
                      background: 'var(--dark10)',
                      borderRadius: '8px',
                      padding: '0.75rem 1rem',
                    }}
                  >
                    <FlexRow gap='0.75rem'>
                      <Text wrap copy={link}>
                        {link}
                      </Text>
                    </FlexRow>
                  </div>
                  <Text small centered>
                    Tap the link above to copy
                  </Text>
                </FlexCol>
              ) : null}

              {/* Refresh */}
              <Button label='Refresh' secondary loading={isLoading} onClick={refetch} />
            </FlexCol>
          )}
        </Padded>
      </Content>
    </>
  )
}
