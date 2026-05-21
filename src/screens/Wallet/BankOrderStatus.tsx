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
import Text, { TextLabel, TextSecondary } from '../../components/Text'
import Button from '../../components/Button'
import ButtonsOnBottom from '../../components/ButtonsOnBottom'
import Shadow from '../../components/Shadow'
import Loading from '../../components/Loading'
import ErrorMessage from '../../components/Error'
import Info from '../../components/Info'
import Table, { TableData } from '../../components/Table'
import CheckMarkIcon from '../../icons/CheckMark'
import { SepaDataView, SwiftDataView, TransferReferenceBox, BankCircuitSelector } from '../../components/BankDetails'
import { NavigationContext, Pages } from '../../providers/navigation'
import { FlowContext } from '../../providers/flow'
import { getOrderStatus, ChimeraOrder } from '../../providers/chimera'
import { prettyDate } from '../../lib/format'
import { type BankCircuit } from '../../lib/bankTransferConfig'

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
  const [order, setOrder] = useState<ChimeraOrder | null>(initialOrder ?? null)
  const [refreshing, setRefreshing] = useState(false)

  // Fetch order status on mount and periodically
  useEffect(() => {
    if (!order?.id) {
      setLoading(false)
      setError('No order information available')
      return
    }

    const fetchStatus = async () => {
      try {
        const orderData = await getOrderStatus(order.id)
        setOrder(orderData)
        setError('')
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to load order'
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
      const orderData = await getOrderStatus(order.id)
      setOrder(orderData)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh order')
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
        <Header text='Order Status' back={goBack} />
        <Content>
          <Loading text='Loading order details...' />
        </Content>
      </>
    )
  }

  if (error || !order) {
    return (
      <>
        <Header text='Order Status' back={goBack} />
        <Content>
          <Padded>
            <FlexCol gap='1rem'>
              <ErrorMessage error text={error || 'Order not found'} />
              <Button onClick={handleBackToWallet} label='Back to Wallet' />
            </FlexCol>
          </Padded>
        </Content>
      </>
    )
  }

  // Status helpers
  const isWaitingForDeposit = order.status === 'WAITING_FOR_DEPOSIT'
  const isCompleted = order.status === 'COMPLETED' || order.status === 'APPROVED'
  const isExpired = order.status === 'EXPIRED'
  const isCancelled = order.status === 'CANCELLED'
  const isRejected = order.status === 'REJECTED'
  const isProcessing = ['DEPOSIT_RECEIVED', 'DEPOSIT_CONFIRMED', 'PROCESSING'].includes(order.status)

  // Use currentBankOrderType as the source of truth. Fallback: anything with BTC/BTC-ARK as from_asset is a withdrawal.
  const isWithdrawalOrder =
    currentBankOrderType === 'send' ||
    (currentBankOrderType === undefined &&
      (order.from_asset === 'BTC' || order.from_asset?.startsWith('BTC')))
  const isDepositOrder = !isWithdrawalOrder

  // Fiat amount the user specified for a withdrawal
  const withdrawalFiatDisplay = `${Number(bankSendInfo.amount).toFixed(2)} ${bankSendInfo.currency}`

  // Build table data
  const tableData: TableData = [
    ['Order ID', order.id.slice(0, 8) + '...'],
    ['Status', order.status.replace(/_/g, ' ')],
    ...(isWithdrawalOrder
      ? ([['To', `${Number(bankSendInfo.amount).toFixed(2)} ${bankSendInfo.currency}`]] as TableData)
      : ([
          ['From', `${order.from_amount} ${order.from_asset}`],
          ['To', order.to_asset],
        ] as TableData)),
    ['Created', prettyDate(new Date(order.created_at).getTime())],
  ]

  if (order.expires_at && isWaitingForDeposit) {
    tableData.push(['Expires', prettyDate(new Date(order.expires_at).getTime())])
  }

  if (order.deposit_amount) {
    tableData.push(['Deposit Amount', order.deposit_amount])
  }

  // Check for bank deposit details
  const hasSepaDetails = Boolean(order.deposit_sepa_address)
  const hasSwiftDetails = Boolean(order.deposit_swift_address)
  const hasBankDetails = hasSepaDetails || hasSwiftDetails

  // Active circuit state: default to what the user originally selected, fall back to whatever is available
  const defaultCircuit: BankCircuit =
    bankRecvInfo.circuit === 'swift' && hasSwiftDetails
      ? 'swift'
      : bankRecvInfo.circuit === 'sepa' && hasSepaDetails
        ? 'sepa'
        : hasSepaDetails
          ? 'sepa'
          : 'swift'
  const [activeCircuit, setActiveCircuit] = useState<BankCircuit>(defaultCircuit)

  return (
    <>
      <Header text='Order Status' back={goBack} />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
            {/* Status Banner */}
            {isCompleted ? (
              <Info color='green' icon={<CheckMarkIcon small />} title='Order Completed'>
                <TextSecondary>Your transfer has been completed successfully.</TextSecondary>
              </Info>
            ) : null}

            {isExpired ? (
              <Info color='red' title='Order Expired'>
                <TextSecondary>This order has expired. Please create a new order.</TextSecondary>
              </Info>
            ) : null}

            {isCancelled ? (
              <Info color='red' title='Order Cancelled'>
                <TextSecondary>This order has been cancelled.</TextSecondary>
              </Info>
            ) : null}

            {isRejected ? (
              <Info color='red' title='Order Rejected'>
                <TextSecondary>This order was rejected. Please contact support.</TextSecondary>
              </Info>
            ) : null}

            {isProcessing ? (
              <Info color='yellow' title='Processing'>
                <TextSecondary>
                  {isDepositOrder
                    ? 'Your bank deposit has been received and is being processed.'
                    : 'Your payment has been received. We are processing your withdrawal and will send the funds to your bank account.'}
                </TextSecondary>
              </Info>
            ) : null}

            {isWaitingForDeposit ? (
              <Info color='blue' title={isDepositOrder ? 'Awaiting Bank Transfer' : 'Withdrawal Submitted'}>
                <TextSecondary>
                  {isDepositOrder
                    ? 'Waiting for your bank transfer. Once received, your order will be processed.'
                    : `Your withdrawal is being processed. You will receive ${withdrawalFiatDisplay} in your bank account once confirmed.`}
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

                {/* Circuit switcher when both are available */}
                {hasSepaDetails && hasSwiftDetails ? (
                  <FlexCol gap='0.5rem'>
                    <TextLabel>Transfer Method</TextLabel>
                    <BankCircuitSelector
                      currency={bankRecvInfo.currency}
                      selectedCircuit={activeCircuit}
                      onSelect={setActiveCircuit}
                    />
                  </FlexCol>
                ) : null}

                {/* SEPA Details */}
                {activeCircuit === 'sepa' && hasSepaDetails ? (
                  <Shadow fat>
                    <FlexCol gap='0.5rem'>
                      <Text bold>SEPA Bank Details</Text>
                      <SepaDataView
                        iban={order.deposit_sepa_address}
                        bic={order.deposit_sepa_bic}
                        beneficiary={order.deposit_sepa_beneficiary}
                        beneficiaryAddress={order.deposit_sepa_beneficiary_address}
                        bankName={order.deposit_sepa_bank_name}
                        bankAddress={order.deposit_sepa_bank_address}
                      />
                    </FlexCol>
                  </Shadow>
                ) : null}

                {/* SWIFT Details */}
                {activeCircuit === 'swift' && hasSwiftDetails ? (
                  <Shadow fat>
                    <FlexCol gap='0.5rem'>
                      <Text bold>SWIFT Bank Details</Text>
                      <SwiftDataView
                        iban={order.deposit_swift_address}
                        bic={order.deposit_swift_bic}
                        intermediaryBic={order.deposit_swift_intermediary_address}
                        beneficiary={order.deposit_swift_beneficiary}
                        beneficiaryAddress={order.deposit_swift_beneficiary_address}
                        bankName={order.deposit_swift_bank_name}
                        bankAddress={order.deposit_swift_bank_address}
                      />
                    </FlexCol>
                  </Shadow>
                ) : null}
              </FlexCol>
            ) : null}

            {/* Completed withdrawal message */}
            {isCompleted && isWithdrawalOrder ? (
              <Info color='green' title='Funds Sent'>
                <TextSecondary>
                  {withdrawalFiatDisplay} has been sent to your bank account.
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
            label={refreshing ? 'Refreshing...' : 'Refresh Status'}
            secondary
            disabled={refreshing}
            loading={refreshing}
          />
        ) : null}
        <Button onClick={handleBackToWallet} label='Back to Wallet' />
        {isCompleted || isExpired || isCancelled || isRejected ? (
          <Button
            onClick={() => navigate(isWithdrawalOrder ? Pages.BankSend : Pages.ReceiveAmount)}
            label='New Transfer'
            secondary
          />
        ) : null}
      </ButtonsOnBottom>
    </>
  )
}
