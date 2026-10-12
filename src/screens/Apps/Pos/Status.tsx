/**
 * POS payment status: a recap of the sale, completed (green tick) or failed
 * (red cross), with print / share. Fiat sales also show their payout to the
 * bank account, which can be retried if it failed. Closing returns to the
 * POS main page; back returns to wherever it was opened from (the payment
 * QR replaces itself with this page, so that's the terminal or the history).
 */

import { useContext } from 'react'
import { Check, Loader2, Printer, Share2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import Content from '../../../components/Content'
import FlexCol from '../../../components/FlexCol'
import FlexRow from '../../../components/FlexRow'
import Header from '../../../components/Header'
import Padded from '../../../components/Padded'
import Shadow from '../../../components/Shadow'
import Text, { TextSecondary } from '../../../components/Text'
import WarningBox from '../../../components/Warning'
import { useShare } from '../../../hooks/useShare'
import { consoleError } from '../../../lib/logs'
import { isFiatPayout, posPaymentOutcome, type PosOutcome, type PosPayment } from '../../../lib/pos'
import { convertPosPayment, isConversionInterrupted } from '../../../lib/posConversion'
import { generateTablePdf } from '../../../lib/statement'
import { AspContext } from '../../../providers/asp'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { WalletContext } from '../../../providers/wallet'
import { btcAmount, methodName, paymentFiat, usePosPayment } from './shared'

const OUTCOME_UI: Record<PosOutcome, { title: string; color: string; icon: JSX.Element }> = {
  completed: { title: 'apps.pos.status.completed', color: 'var(--green-500)', icon: <Check size={56} /> },
  failed: { title: 'apps.pos.status.failed', color: 'var(--red-500)', icon: <X size={56} /> },
  pending: {
    title: 'apps.pos.status.pending',
    color: 'var(--neutral-500)',
    icon: <Loader2 size={56} className='animate-spin' />,
  },
}

/** Label/value rows of the recap, shared by the screen, the receipt and the share text. */
const recapRows = (payment: PosPayment, t: TFunction): [string, string][] => {
  const rows: [string, string][] = [
    [t('apps.pos.status.amount'), paymentFiat(payment)],
    [t('apps.pos.status.received'), btcAmount(payment.receivedSats ?? 0)],
    [t('apps.pos.status.method'), t(methodName(payment.method))],
    [t('apps.pos.status.date'), new Date(payment.completedAt ?? payment.createdAt).toLocaleString()],
  ]
  if (payment.note) rows.push([t('apps.pos.status.note'), payment.note])
  if (payment.conversion?.orderId) rows.push([t('apps.pos.status.order'), payment.conversion.orderId])
  rows.push([t('apps.pos.status.reference'), payment.id])
  return rows
}

export default function PosStatus() {
  const { t } = useTranslation()
  const { navigationData, popTo, goBack } = useContext(NavigationContext)
  const { svcWallet } = useContext(WalletContext)
  const { aspInfo } = useContext(AspContext)
  const { canShare, share } = useShare()

  const payment = usePosPayment(navigationData?.paymentId as string | undefined)
  if (!payment) return null

  const rows = recapRows(payment, t)
  const outcome = OUTCOME_UI[posPaymentOutcome(payment)]
  const title = t(outcome.title)

  const conversion = payment.conversion
  const interrupted = isConversionInterrupted(payment)
  const conversionProblem = conversion?.status === 'failed' || interrupted
  const canRetry = isFiatPayout(payment.payoutCurrency) && payment.status === 'completed' && (!conversion || conversionProblem)

  const conversionText = (() => {
    if (!conversion) return null
    if (interrupted) return t('apps.pos.status.interrupted')
    switch (conversion.status) {
      case 'converting':
        return t('apps.pos.status.converting', { currency: conversion.currency })
      case 'submitted':
        return t('apps.pos.status.submitted')
      case 'failed':
        return t('apps.pos.status.conversionFailed', { currency: conversion.currency })
    }
  })()

  const shareContent = { title, text: [title, ...rows.map(([label, value]) => `${label}: ${value}`)].join('\n') }

  // The POS main page is always in the back stack here, so this unwinds to it
  const close = () => popTo(Pages.AppPos)

  const handlePrint = () => {
    generateTablePdf({
      title: t('apps.pos.status.receiptTitle'),
      subtitle: title,
      head: ['', ''],
      rows,
      columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' } },
      filename: `receipt_${payment.id}.pdf`,
      print: true,
    }).catch(consoleError)
  }

  const retry = () => {
    if (svcWallet) convertPosPayment(payment.id, { svcWallet, signerPubkey: aspInfo.signerPubkey })
  }

  return (
    <>
      <Header text={t('apps.pos.title')} back={goBack} />
      <Content>
        <Padded>
          <FlexCol gap='1.25rem'>
            <FlexCol centered gap='0.75rem'>
              <div
                data-testid={`pos-status-${posPaymentOutcome(payment)}`}
                style={{
                  alignItems: 'center',
                  backgroundColor: outcome.color,
                  borderRadius: '50%',
                  color: '#fff',
                  display: 'flex',
                  height: 96,
                  justifyContent: 'center',
                  width: 96,
                }}
              >
                {outcome.icon}
              </div>
              <Text big bold centered>
                {title}
              </Text>
            </FlexCol>

            {conversionText && conversionProblem ? (
              <WarningBox text={[conversionText, conversion?.error].filter(Boolean).join(' ')} />
            ) : conversionText ? (
              <TextSecondary centered>{conversionText}</TextSecondary>
            ) : null}

            <Shadow>
              <FlexCol gap='0.625rem'>
                {rows.map(([label, value]) => (
                  <FlexRow between key={label} gap='1rem'>
                    <TextSecondary>{label}</TextSecondary>
                    <Text right wrap>
                      {value}
                    </Text>
                  </FlexRow>
                ))}
              </FlexCol>
            </Shadow>
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        {canRetry ? <Button label={t('apps.pos.status.retry')} onClick={retry} disabled={!svcWallet} /> : null}
        <FlexRow gap='0.5rem'>
          <Button
            label={t('apps.pos.status.print')}
            onClick={handlePrint}
            secondary
            icon={<Printer size={16} style={{ marginLeft: 8 }} />}
          />
          <Button
            label={t('apps.pos.status.share')}
            onClick={() => share(shareContent)}
            secondary
            disabled={!canShare(shareContent)}
            icon={<Share2 size={16} style={{ marginLeft: 8 }} />}
          />
        </FlexRow>
        <Button label={t('apps.pos.status.close')} onClick={close} testId='pos-status-close' />
      </ButtonsOnBottom>
    </>
  )
}
