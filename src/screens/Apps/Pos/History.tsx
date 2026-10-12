/**
 * POS payment list: payments in a date range, each with its note and the fiat
 * value fixed at the time of sale. Exports and prints like the account
 * statement (lib/statement::generateTablePdf).
 */

import { useContext, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import Content from '../../../components/Content'
import FlexCol from '../../../components/FlexCol'
import FlexRow from '../../../components/FlexRow'
import Focusable from '../../../components/Focusable'
import Header from '../../../components/Header'
import { InfoLine } from '../../../components/Info'
import InfoContainer from '../../../components/InfoContainer'
import InputDate from '../../../components/InputDate'
import Padded from '../../../components/Padded'
import Text, { TextSecondary } from '../../../components/Text'
import { useDateRange } from '../../../hooks/useDateRange'
import { prettyFiatAmount } from '../../../lib/format'
import { consoleError } from '../../../lib/logs'
import {
  filterPosPaymentsByDateRange,
  getPosPayments,
  posPaymentOutcome,
  totalPosFiatByCurrency,
  type PosPayment,
} from '../../../lib/pos'
import { formatLongDate, generateTablePdf } from '../../../lib/statement'
import type { Fiats } from '../../../lib/types'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { btcAmount, methodName, outcomeName, paymentFiat } from './shared'

export default function PosHistory() {
  const { t } = useTranslation()
  const { navigate } = useContext(NavigationContext)
  const { startDate, endDate, changeStart, changeEnd, rangeError, maxDate } = useDateRange()
  const [generating, setGenerating] = useState(false)

  const payments = useMemo(
    () => filterPosPaymentsByDateRange(getPosPayments(), startDate, endDate),
    [startDate, endDate],
  )
  const totals = Object.entries(totalPosFiatByCurrency(payments)).map(([cur, amount]) =>
    prettyFiatAmount(amount, cur as Fiats),
  )
  const totalText = totals.length ? `${t('apps.pos.history.total')}: ${totals.join(', ')}` : ''
  const outcomeLabel = (p: PosPayment) => t(outcomeName[posPaymentOutcome(p)])
  const open = (p: PosPayment) => navigate(Pages.AppPosStatus, { paymentId: p.id })

  const exportPdf = async (print: boolean) => {
    setGenerating(true)
    try {
      await generateTablePdf({
        title: t('apps.pos.history.exportTitle'),
        subtitle: `${formatLongDate(startDate)} – ${formatLongDate(endDate)}`,
        summary: totalText ? [totalText] : [],
        head: ['Date', 'Note', 'Amount', 'BTC', 'Method', 'Status'],
        rows: payments.map((p) => [
          new Date(p.createdAt).toLocaleString(),
          p.note,
          paymentFiat(p),
          btcAmount(p.receivedSats ?? p.sats),
          t(methodName(p.method)),
          outcomeLabel(p),
        ]),
        columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
        filename: `pos_payments_${startDate.toISOString().slice(0, 10)}_to_${endDate.toISOString().slice(0, 10)}.pdf`,
        print,
      })
    } catch (err) {
      consoleError(err, 'error generating POS export')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <>
      <Header text={t('apps.pos.history.title')} back />
      <Content>
        <Padded>
          <FlexCol gap='1rem'>
            <Text wrap>{t('apps.pos.history.descr')}</Text>
            <InputDate label={t('apps.pos.history.start')} value={startDate} max={maxDate} onChange={changeStart} />
            <InputDate label={t('apps.pos.history.end')} value={endDate} max={maxDate} onChange={changeEnd} />

            <InfoContainer>
              {rangeError ? <InfoLine compact color='orange' text={rangeError} /> : null}
              {payments.length ? (
                <InfoLine compact text={t('apps.pos.history.found', { count: payments.length })} />
              ) : (
                <InfoLine compact color='orange' text={t('apps.pos.history.empty')} />
              )}
              {totalText ? <InfoLine compact text={totalText} /> : null}
            </InfoContainer>

            <FlexCol gap='0.5rem'>
              {payments.map((p) => (
                <Focusable key={p.id} onEnter={() => open(p)}>
                  <div
                    data-testid='pos-history-row'
                    onClick={() => open(p)}
                    style={{ backgroundColor: 'var(--surface)', borderRadius: 12, cursor: 'pointer', padding: '0.75rem 1rem' }}
                  >
                    <FlexRow between gap='0.75rem'>
                      <FlexCol gap='0.125rem'>
                        <Text medium>{paymentFiat(p)}</Text>
                        <TextSecondary>{p.note || new Date(p.createdAt).toLocaleString()}</TextSecondary>
                      </FlexCol>
                      <FlexCol gap='0.125rem'>
                        <Text right small>
                          {outcomeLabel(p)}
                        </Text>
                        <TextSecondary>{p.note ? new Date(p.createdAt).toLocaleDateString() : t(methodName(p.method))}</TextSecondary>
                      </FlexCol>
                    </FlexRow>
                  </div>
                </Focusable>
              ))}
            </FlexCol>
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <FlexRow gap='0.5rem'>
          <Button
            label={generating ? t('apps.pos.history.generating') : t('apps.pos.history.exportPdf')}
            onClick={() => exportPdf(false)}
            disabled={generating || payments.length === 0}
          />
          <Button
            label={t('apps.pos.history.print')}
            onClick={() => exportPdf(true)}
            disabled={generating || payments.length === 0}
            secondary
          />
        </FlexRow>
      </ButtonsOnBottom>
    </>
  )
}
