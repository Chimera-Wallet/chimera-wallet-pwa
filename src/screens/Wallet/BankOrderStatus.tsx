/**
 * Bank Order Status Screen
 *
 * Shows the status of a bank transfer order (deposit or withdrawal)
 * with periodic polling for updates.
 */

import { useContext, useState, useEffect } from 'react'
import Content from '../../components/Content'
import FlexCol from '../../components/FlexCol'
import Header from '../../components/Header'
import Padded from '../../components/Padded'
import Text, { TextSecondary } from '../../components/Text'
import Button from '../../components/Button'
import ButtonsOnBottom from '../../components/ButtonsOnBottom'
import Shadow from '../../components/Shadow'
import Loading from '../../components/Loading'
import ErrorMessage from '../../components/Error'
import Info from '../../components/Info'
import Table, { TableData } from '../../components/Table'
import CheckMarkIcon from '../../icons/CheckMark'
import { SepaDataView, SwiftDataView, TransferReferenceBox } from '../../components/BankDetails'
import { NavigationContext, Pages } from '../../providers/navigation'
import { FlowContext } from '../../providers/flow'
import { getBankOrderStatus, type BankOrder } from '../../providers/bankTransfer'
import { prettyDate } from '../../lib/format'
import { useTranslation } from 'react-i18next'

// Polling interval in milliseconds
const POLL_INTERVAL = 30000

export default function BankOrderStatus() {
  const { navigate, goBack } = useContext(NavigationContext)
  const { bankRecvInfo, bankSendInfo, bankStatusOrder, currentBankOrderType } = useContext(FlowContext)

  // bankStatusOrder is set when coming from history; fall back to the active flow order
  const initialOrder =
    bankStatusOrder ??
    (currentBankOrderType === 'receive'
      ? bankRecvInfo.order
      : currentBankOrderType === 'send'
        ? bankSendInfo.order
        : (bankRecvInfo.order ?? bankSendInfo.order))

  const [loading, setLoading] = useState(!initialOrder)
  const [error, setError] = useState('')
  const [order, setOrder] = useState<BankOrder | null>(initialOrder ?? null)
  const [refreshing, setRefreshing] = useState(false)
  const {t} = useTranslation()

  // Fetch order status on mount and periodically
  useEffect(() => {
    if (!order?.id) {
      setLoading(false)
      setError(t('errors.receive.bank.noOrderInfo'))
      return
    }

    const fetchStatus = async () => {
      try {
        const orderData = await getBankOrderStatus(order.id, order.direction)
        setOrder(orderData)
        setError('')
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : t('errors.receive.bank.failedLoad')
        setError(errorMsg)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    }

    fetchStatus()

    // Poll for updates every 30 seconds
    const interval = setInterval(fetchStatus, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [order?.id])

  const handleRefresh = async () => {
    if (!order?.id) return
    setRefreshing(true)
    try {
      const orderData = await getBankOrderStatus(order.id, order.direction)
      setOrder(orderData)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.receive.bank.failedRefresh'))
    } finally {
      setRefreshing(false)
    }
  }

  const handleBackToWallet = () => {
    navigate(Pages.Wallet)
  }


  if (loading) {
    return (
      <>
        <Header text={t('common.general.bank.orderStatus')} back={goBack} />
        <Content>
          <Loading text={t('common.general.bank.loadingOrder')} />
        </Content>
      </>
    )
  }

  if (error || !order) {
    return (
      <>
        <Header text={t('common.general.bank.orderStatus')} back={goBack} />
        <Content>
          <Padded>
            <FlexCol gap='1rem'>
              <ErrorMessage error text={error || t('common.general.bank.orderNotFound')} />
              <Button onClick={handleBackToWallet} label={t('common.general.backToWallet')} />
            </FlexCol>
          </Padded>
        </Content>
      </>
    )
  }

  // Status helpers
  const isWaitingForDeposit = order.status === 'WAITING_FOR_DEPOSIT'
  const isCompleted = order.status === 'COMPLETED'
  const isExpired = order.status === 'EXPIRED'
  const isRejected = order.status === 'REJECTED' || order.status === 'FAILED'
  const isProcessing = ['DEPOSIT_RECEIVED', 'PROCESSING', 'PENDING_MANUAL'].includes(order.status)

  const isWithdrawalOrder = order.direction === 'offramp'
  const isDepositOrder = !isWithdrawalOrder

  // Fiat amount — known immediately for a deposit (on-ramp), only known after
  // settlement for a withdrawal (off-ramp); fall back to what the user
  // declared in the form until then. See CLAUDE.md "Pricing model".
  const withdrawalFiatDisplay = order.fiat_amount
    ? `${order.fiat_amount} ${order.fiat_currency}`
    : `${Number(bankSendInfo.amount).toFixed(2)} ${bankSendInfo.currency}`

  // Build table data
  const tableData: TableData = [
    [t('common.general.bank.orderNumberSimple'), order.id.slice(0, 8) + '...'],
    [t('common.general.status'), order.status.replace(/_/g, ' ')],
    ...(isWithdrawalOrder
      ? ([
          ['From', `${order.crypto_amount ?? bankSendInfo.amount} ${order.asset ?? ''}`],
          ['To', withdrawalFiatDisplay],
        ] as TableData)
      : ([
          ['From', `${order.fiat_amount} ${order.fiat_currency}`],
          ['To', order.crypto_amount ? `${order.crypto_amount} ${order.asset}` : (order.asset ?? '')],
        ] as TableData)),
    [t('common.general.created'), prettyDate(new Date(order.created_at).getTime())],
  ]

  if (order.expires_at && isWaitingForDeposit) {
    tableData.push([t('common.general.bank.expires'), prettyDate(new Date(order.expires_at).getTime())])
  }

  // Bank deposit details — ramp-system returns exactly one bank account per
  // currency (no sepa/swift choice), unlike the old dual-circuit response.
  const hasBankDetails = Boolean(order.deposit_iban)

  return (
    <>
      <Header text={t('common.general.bank.orderStatus')} back={goBack} />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
            {/* Status Banner */}
            {isCompleted ? (
              <Info color='green' icon={<CheckMarkIcon small />} title={t('common.general.bank.orderCompleted')}>
                <TextSecondary>{t('common.general.bank.orderCompletedDescr')}</TextSecondary>
              </Info>
            ) : null}

            {isExpired ? (
              <Info color='red' title={t('common.general.bank.orderExpired')}>
                <TextSecondary>{t('common.general.bank.orderExpiredDescr')}</TextSecondary>
              </Info>
            ) : null}

            {isRejected ? (
              <Info color='red' title={t('common.general.bank.orderRejected')}>
                <TextSecondary>{t('common.general.bank.orderRejectedDescr')}</TextSecondary>
              </Info>
            ) : null}

            {isProcessing ? (
              <Info color='yellow' title={t('common.general.bank.processing')}>
                <TextSecondary>
                  {isDepositOrder
                    ? t('common.general.bank.processingDescr')
                    : t('common.general.bank.paymentReceived')}
                </TextSecondary>
              </Info>
            ) : null}

            {isWaitingForDeposit ? (
              <Info color='blue' title={isDepositOrder ? t('common.general.bank.awaitingtransfer') : t('common.general.bank.withdrawalSubmit')}>
                <TextSecondary>
                  {isDepositOrder
                    ? t('common.general.bank.waitingForTransfer')
                    : t('common.genreal.bank.withdrawlProcessing', {fiat: withdrawalFiatDisplay})}
                </TextSecondary>
              </Info>
            ) : null}

            {/* Order Details Table */}
            <Table data={tableData} />

            {/* Bank Deposit Details (for deposit orders waiting for fiat transfer) */}
            {isWaitingForDeposit && isDepositOrder && hasBankDetails ? (
              <FlexCol gap='1rem'>
                {/* Transfer Reference */}
                {order.transfer_code ? <TransferReferenceBox reference={order.transfer_code} /> : null}

                <Shadow fat>
                  <FlexCol gap='0.5rem'>
                    <Text bold>{order.deposit_payment_type === 'swift' ? 'SWIFT' : 'SEPA'} Bank Details</Text>
                    {order.deposit_payment_type === 'swift' ? (
                      <SwiftDataView
                        iban={order.deposit_iban ?? undefined}
                        bic={order.deposit_bic ?? undefined}
                        beneficiary={order.deposit_beneficiary ?? undefined}
                        bankName={order.deposit_bank_name ?? undefined}
                      />
                    ) : (
                      <SepaDataView
                        iban={order.deposit_iban ?? undefined}
                        bic={order.deposit_bic ?? undefined}
                        beneficiary={order.deposit_beneficiary ?? undefined}
                        bankName={order.deposit_bank_name ?? undefined}
                      />
                    )}
                  </FlexCol>
                </Shadow>
              </FlexCol>
            ) : null}

            {/* Completed withdrawal message */}
            {isCompleted && isWithdrawalOrder ? (
              <Info color='green' title='Funds Sent'>
                <TextSecondary>
                  {t('common.general.bank.completeMessage', {fiat: withdrawalFiatDisplay})}
                </TextSecondary>
              </Info>
            ) : null}
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        {isWaitingForDeposit ? (
          <Button
            onClick={handleRefresh}
            label={refreshing ? t('common.general.refreshing') : t('common.general.bank.refreshStatus')}
            secondary
            disabled={refreshing}
            loading={refreshing}
          />
        ) : null}
        <Button onClick={handleBackToWallet} label={t('common.general.backToWallet')} />
        {isCompleted || isExpired || isRejected ? (
          <Button
            onClick={() => navigate(isWithdrawalOrder ? Pages.BankSend : Pages.ReceiveAmount)}
            label={t('common.general.bank.newTransfer')}
            secondary
          />
        ) : null}
      </ButtonsOnBottom>
    </>
  )
}
