import { useContext, useEffect } from 'react'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import Content from '../../../components/Content'
import { NotificationsContext } from '../../../providers/notifications'
import { FlowContext } from '../../../providers/flow'
import { prettyAmount, prettyFiatAmount } from '../../../lib/format'
import Header from '../../../components/Header'
import Success from '../../../components/Success'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { ConfigContext } from '../../../providers/config'
import { FiatContext } from '../../../providers/fiat'
import {useTranslation} from 'react-i18next'

export default function NotesSuccess() {
  const { config, useFiat } = useContext(ConfigContext)
  const { toFiat } = useContext(FiatContext)
  const { noteInfo } = useContext(FlowContext)
  const { notifyPaymentReceived } = useContext(NotificationsContext)
  const { navigate } = useContext(NavigationContext)
  
  const {t} = useTranslation()

  useEffect(() => {
    notifyPaymentReceived(noteInfo.satoshis)
  }, [])

  const displayAmount = useFiat
    ? prettyFiatAmount(toFiat(noteInfo.satoshis), config.fiat)
    : prettyAmount(noteInfo.satoshis)

  return (
    <>
      <Header text= {t('common.general.success')}/>
      <Content>
        <Success headline={t('common.general.notes.noteRedeemed')} text={t('common.general.notes.redeemSuccess', {amount: displayAmount})} />
      </Content>
      <ButtonsOnBottom>
        <Button label={t('common.general.notes.soundsGood')} onClick={() => navigate(Pages.Wallet)} />
      </ButtonsOnBottom>
    </>
  )
}
