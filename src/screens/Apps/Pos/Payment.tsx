/**
 * POS payment request: shows the customer a QR code for the sale and waits for
 * the payment. Uses the wallet's own receive rails — the Arkade address, or a
 * Lightning hold invoice from LnReceiveContext — and the shared
 * useIncomingPayments listener, exactly like the Receive screens.
 *
 * Matching the payment to the sale (and starting the fiat conversion) is done
 * by the background PosSettlement service, so a sale is still settled if the
 * customer pays after this screen is closed. This screen just shows the sale
 * and moves to its status page once it's paid.
 */

import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import Content from '../../../components/Content'
import ErrorMessage from '../../../components/Error'
import FlexCol from '../../../components/FlexCol'
import FlexRow from '../../../components/FlexRow'
import Header from '../../../components/Header'
import Loading from '../../../components/Loading'
import Padded from '../../../components/Padded'
import QrCode from '../../../components/QrCode'
import Shadow from '../../../components/Shadow'
import Text, { TextSecondary } from '../../../components/Text'
import TermsInfo from '../../../components/TermsInfo'
import WarningBox from '../../../components/Warning'
import { BankFieldBox } from '../../../components/BankDetails'
import { getReceivingAddresses } from '../../../lib/asp'
import { encodeBip21 } from '../../../lib/bip21'
import { extractError } from '../../../lib/error'
import { prettyNumber } from '../../../lib/format'
import { consoleError } from '../../../lib/logs'
import { keepPosSaleOpen, POS_SALE_WINDOW_MS, updatePosPayment } from '../../../lib/pos'
import { TERMS_AND_CONDITIONS, TRANSFER_METHOD } from '../../../lib/transferMethods'
import { LimitsContext } from '../../../providers/limits'
import { LnReceiveContext } from '../../../providers/lnReceive'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { WalletContext } from '../../../providers/wallet'
import { btcAmount, CurrencyLogo, methodName, paymentFiat, usePosPayment } from './shared'

export default function PosPayment() {
  const { t } = useTranslation()
  const { navigate, goBack, navigationData } = useContext(NavigationContext)
  const { svcWallet } = useContext(WalletContext)
  const { validVtxoTx, vtxoTxsAllowed } = useContext(LimitsContext)
  const { requestReceive } = useContext(LnReceiveContext)

  const paymentId = navigationData?.paymentId as string | undefined
  const payment = usePosPayment(paymentId)

  const [arkAddress, setArkAddress] = useState('')
  const [invoice, setInvoice] = useState('')
  const [error, setError] = useState('')

  const isLightning = payment?.method === TRANSFER_METHOD.lightning
  const outsideLimits = Boolean(payment && !isLightning && (!vtxoTxsAllowed() || !validVtxoTx(payment.sats)))

  // Paid (settled by PosSettlement): show its status in this page's place, so
  // back from there skips the paid QR
  useEffect(() => {
    if (paymentId && payment?.status === 'completed') navigate(Pages.AppPosStatus, { paymentId }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment?.status])

  // While the QR is on screen the sale stays open; once closed, it stays open
  // to a late payment for one more window (lib/pos::POS_SALE_WINDOW_MS)
  useEffect(() => {
    if (!paymentId) return
    keepPosSaleOpen(paymentId)
    const timer = setInterval(() => keepPosSaleOpen(paymentId), 60_000)
    return () => clearInterval(timer)
  }, [paymentId])

  // Payment destination for the chosen method
  useEffect(() => {
    if (!svcWallet || !payment) return
    let abandoned = false

    if (!isLightning) {
      getReceivingAddresses(svcWallet)
        .then(({ offchainAddr }) => {
          if (abandoned) return
          if (!offchainAddr) throw t('errors.receive.general.offChain')
          setArkAddress(offchainAddr)
        })
        .catch((err) => {
          if (abandoned) return
          consoleError(err, 'error getting POS receiving address')
          setError(extractError(err))
        })
    } else {
      // `requestReceive` persists the swap before returning, so the claim is
      // driven to completion independently of this screen.
      requestReceive(payment.sats)
        .then((pending) => {
          if (abandoned) return
          setInvoice(pending.invoice)
          // The wallet receives the invoice amount net of the swap, and a paid
          // hold invoice can settle after it expires
          updatePosPayment(payment.id, {
            expectedSats: pending.expectedAmount,
            openUntil: Math.max(payment.openUntil, pending.invoiceExpiresAt * 1000 + POS_SALE_WINDOW_MS),
          })
        })
        .catch((err) => {
          if (abandoned) return
          consoleError(err, 'error negotiating POS lightning receive')
          setError(extractError(err))
        })
    }

    return () => {
      abandoned = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svcWallet, paymentId])

  if (!payment) return null

  const destination = isLightning ? invoice : arkAddress
  const qrValue = isLightning ? invoice : arkAddress && encodeBip21('', arkAddress, '', payment.sats)
  const showRequest = !outsideLimits && !error

  return (
    <>
      <Header text={t('apps.pos.title')} back={goBack} />
      <Content noRefresh>
        <Padded>
          <FlexCol gap='0.75rem'>
            <Shadow>
              <FlexRow gap='0.75rem'>
                <CurrencyLogo currency='BTC' />
                <FlexCol gap='0'>
                  <Text medium>{t('apps.pos.payment.asset')}</Text>
                  <TextSecondary>{t(methodName(payment.method))}</TextSecondary>
                </FlexCol>
              </FlexRow>
            </Shadow>

            <FlexCol centered gap='0.25rem'>
              <Text big bold centered testId='pos-payment-fiat'>
                {paymentFiat(payment)}
              </Text>
              <TextSecondary centered>{btcAmount(payment.sats)}</TextSecondary>
              {payment.note ? <TextSecondary centered>{payment.note}</TextSecondary> : null}
            </FlexCol>

            <ErrorMessage error={Boolean(error)} text={error} />
            {outsideLimits ? <WarningBox text={t('apps.pos.payment.limits')} /> : null}

            {showRequest ? (
              <>
                <Shadow>
                  <FlexCol gap='0.5rem'>
                    <TextSecondary>{t('apps.pos.payment.qrLabel')}</TextSecondary>
                    {qrValue ? (
                      <div style={{ margin: '0 auto', maxWidth: 260, width: '100%' }} data-testid='pos-qr'>
                        <QrCode value={qrValue} />
                      </div>
                    ) : (
                      <Loading text={t('apps.pos.payment.generating')} />
                    )}
                  </FlexCol>
                </Shadow>

                <BankFieldBox
                  label={isLightning ? t('apps.pos.payment.invoice') : t('apps.pos.payment.arkAddress')}
                  value={destination}
                  copyable
                  multiline
                />

                <TermsInfo items={TERMS_AND_CONDITIONS.receive[payment.method]} />
                {payment.receivedSats ? (
                  <WarningBox
                    text={t('apps.pos.payment.partial', {
                      received: prettyNumber(payment.receivedSats, 0),
                      expected: prettyNumber(payment.expectedSats ?? payment.sats, 0),
                    })}
                  />
                ) : null}
                {qrValue ? <TextSecondary centered>{t('apps.pos.payment.waiting')}</TextSecondary> : null}
              </>
            ) : null}
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button label={t('apps.pos.payment.close')} onClick={goBack} secondary testId='pos-payment-close' />
      </ButtonsOnBottom>
    </>
  )
}
