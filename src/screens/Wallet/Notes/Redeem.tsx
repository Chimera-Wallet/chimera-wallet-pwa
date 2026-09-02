import { useContext, useEffect, useState } from 'react'
import { FlowContext } from '../../../providers/flow'
import Content from '../../../components/Content'
import Padded from '../../../components/Padded'
import ErrorMessage from '../../../components/Error'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import Button from '../../../components/Button'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { extractError } from '../../../lib/error'
import { redeemNotes } from '../../../lib/asp'
import LoadingLogo from '../../../components/LoadingLogo'
import Header from '../../../components/Header'
import FlexCol from '../../../components/FlexCol'
import { consoleError } from '../../../lib/logs'
import { WalletContext } from '../../../providers/wallet'
import Details, { DetailsProps } from '../../../components/Details'
import { AspContext } from '../../../providers/asp'
import { useTranslation } from 'react-i18next'

export default function NotesRedeem() {
  const { aspInfo } = useContext(AspContext)
  const { noteInfo } = useContext(FlowContext)
  const { navigate } = useContext(NavigationContext)
  const { svcWallet } = useContext(WalletContext)

  const defaultButtonLabel = 'Redeem Note'

  const [buttonLabel, setButtonLabel] = useState(defaultButtonLabel)
  const [error, setError] = useState('')
  const [redeeming, setRedeeming] = useState(false)

  const {t} = useTranslation()

  useEffect(() => {
    setError(aspInfo.unreachable ? t('errors.send.arkade.server') : '')
  }, [aspInfo.unreachable])

  useEffect(() => {
    setButtonLabel(redeeming ? t('common.general.notes.redeeming') : defaultButtonLabel)
  }, [redeeming])

  const handleBack = () => {
    navigate(Pages.NotesForm)
  }

  if (!svcWallet) return <LoadingLogo text= {t('common.general.loading')} />

  const handleRedeem = async () => {
    setError('')
    setRedeeming(true)
    try {
      await redeemNotes(svcWallet, [noteInfo.note])
      navigate(Pages.NotesSuccess)
    } catch (err) {
      consoleError(err, 'error redeeming note')
      setError(extractError(err))
    }
    setRedeeming(false)
  }

  const details: DetailsProps = {
    arknote: noteInfo.note,
    satoshis: noteInfo.satoshis,
  }

  return (
    <>
      <Header text={t('common.general.notes.redeemNote')} back={handleBack} />
      <Content>
        {redeeming ? (
          <LoadingLogo text={t('common.general.notes.processing')} />
        ) : (
          <Padded>
            <FlexCol gap='2rem'>
              <ErrorMessage error={Boolean(error)} text={error} />
              <Details details={details} />
            </FlexCol>
          </Padded>
        )}
      </Content>
      <ButtonsOnBottom>
        <Button onClick={handleRedeem} label={buttonLabel} disabled={redeeming} />
      </ButtonsOnBottom>
    </>
  )
}
