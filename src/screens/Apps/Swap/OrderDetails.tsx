import { useContext, useState, useEffect } from 'react'
import Content from '../../../components/Content'
import FlexCol from '../../../components/FlexCol'
import Header from '../../../components/Header'
import Padded from '../../../components/Padded'
import Text, { TextLabel, TextSecondary } from '../../../components/Text'
import Button from '../../../components/Button'
import Shadow from '../../../components/Shadow'
import Loading from '../../../components/Loading'
import ErrorMessage from '../../../components/Error'
import QrCode from '../../../components/QrCode'
import Table, { TableData } from '../../../components/Table'
import FlexRow from '../../../components/FlexRow'
import Info from '../../../components/Info'
import CheckMarkIcon from '../../../icons/CheckMark'
import CopyIcon from '../../../icons/Copy'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { FlowContext } from '../../../providers/flow'
import { getOrderStatus, ChimeraOrder } from '../../../providers/chimera'
import { prettyDate } from '../../../lib/format'
import { copyToClipboard } from '../../../lib/clipboard'

// Copy button component
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await copyToClipboard(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div onClick={handleCopy} style={{ cursor: 'pointer' }}>
      {copied ? <CheckMarkIcon small /> : <CopyIcon />}
    </div>
  )
}

export default function SwapOrderDetails() {
  const { navigate } = useContext(NavigationContext)
  const { swapOrderInfo } = useContext(FlowContext) as any // Extended FlowContext

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [order, setOrder] = useState<ChimeraOrder | null>(swapOrderInfo || null)
  const [refreshing, setRefreshing] = useState(false)

  // Fetch order status on mount and periodically
  useEffect(() => {
    if (!swapOrderInfo?.id && !order?.id) {
      setLoading(false)
      setError('No order information available')
      return
    }

    const orderId = swapOrderInfo?.id || order?.id

    const fetchStatus = async () => {
      try {
        const orderData = await getOrderStatus(orderId)
        setOrder(orderData)
        setError('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load order')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    }

    fetchStatus()

    // Poll for updates every 30 seconds
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [swapOrderInfo?.id, order?.id])

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

  const handleBack = () => {
    navigate(Pages.AppSwap)
  }

  const handleBackToWallet = () => {
    navigate(Pages.Wallet)
  }

  if (loading) {
    return (
      <>
        <Header text='Order Details' back={handleBack} />
        <Content>
          <Loading text='Loading order details...' />
        </Content>
      </>
    )
  }

  if (error || !order) {
    return (
      <>
        <Header text='Order Details' back={handleBack} />
        <Content>
          <Padded>
            <FlexCol gap='1rem'>
              <ErrorMessage error text={error || 'Order not found'} />
              <Button onClick={handleBack} label='Back to Swap' />
            </FlexCol>
          </Padded>
        </Content>
      </>
    )
  }

  const isWaitingForDeposit = order.status === 'WAITING_FOR_DEPOSIT'
  const isCompleted = order.status === 'COMPLETED' || order.status === 'APPROVED'
  const isExpired = order.status === 'EXPIRED'
  const isCancelled = order.status === 'CANCELLED'
  const isProcessing = ['DEPOSIT_RECEIVED', 'DEPOSIT_CONFIRMED', 'PROCESSING'].includes(order.status)

  const tableData: TableData = [
    ['Order ID', order.id],
    ['Status', order.status.replace(/_/g, ' ')],
    ['From', `${order.from_amount} ${order.from_asset}`],
    ['To', order.to_asset],
    ['Created', prettyDate(new Date(order.created_at).getTime())],
  ]

  if (order.expires_at && isWaitingForDeposit) {
    tableData.push(['Expires', prettyDate(new Date(order.expires_at).getTime())])
  }

  if (order.deposit_amount) {
    tableData.push(['Deposit Amount', order.deposit_amount])
  }

  // Determine deposit address/info to show
  const depositAddress = order.deposit_crypto_address
  const hasCryptoDeposit = Boolean(depositAddress)
  const hasBankDeposit = Boolean(order.deposit_sepa_address || order.deposit_swift_address)

  return (
    <>
      <Header text='Order Details' back={handleBack} />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
            {/* Status Banner */}
            {isCompleted ? (
              <Info color='green' icon={<CheckMarkIcon small />} title='Order Completed'>
                <TextSecondary>Your swap has been completed successfully.</TextSecondary>
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

            {isProcessing ? (
              <Info color='yellow' title='Processing'>
                <TextSecondary>Your deposit has been received and is being processed.</TextSecondary>
              </Info>
            ) : null}

            {/* Order Details Table */}
            <Table data={tableData} />

            {/* Deposit Information for Waiting Orders */}
            {isWaitingForDeposit ? (
              <FlexCol gap='1rem'>
                <TextLabel>Deposit Instructions</TextLabel>

                {/* Crypto Deposit */}
                {hasCryptoDeposit && depositAddress ? (
                  <FlexCol gap='0.75rem'>
                    <Shadow fat>
                      <FlexCol gap='0.5rem'>
                        <Text bold>Send {order.from_asset} to:</Text>
                        <FlexRow between>
                          <Text small wrap>
                            {depositAddress}
                          </Text>
                          <CopyButton value={depositAddress} />
                        </FlexRow>
                      </FlexCol>
                    </Shadow>
                    <QrCode value={depositAddress} />
                  </FlexCol>
                ) : null}

                {/* SEPA Bank Deposit */}
                {hasBankDeposit && order.deposit_sepa_address ? (
                  <Shadow fat>
                    <FlexCol gap='0.5rem'>
                      <Text bold>SEPA Bank Transfer</Text>

                      {order.deposit_sepa_address ? (
                        <FlexRow between>
                          <TextSecondary>IBAN:</TextSecondary>
                          <FlexRow gap='0.25rem'>
                            <Text small>{order.deposit_sepa_address}</Text>
                            <CopyButton value={order.deposit_sepa_address} />
                          </FlexRow>
                        </FlexRow>
                      ) : null}

                      {order.deposit_sepa_bic ? (
                        <FlexRow between>
                          <TextSecondary>BIC:</TextSecondary>
                          <FlexRow gap='0.25rem'>
                            <Text small>{order.deposit_sepa_bic}</Text>
                            <CopyButton value={order.deposit_sepa_bic} />
                          </FlexRow>
                        </FlexRow>
                      ) : null}

                      {order.deposit_sepa_beneficiary ? (
                        <FlexRow between>
                          <TextSecondary>Beneficiary:</TextSecondary>
                          <Text small>{order.deposit_sepa_beneficiary}</Text>
                        </FlexRow>
                      ) : null}

                      {order.deposit_sepa_bank_name ? (
                        <FlexRow between>
                          <TextSecondary>Bank:</TextSecondary>
                          <Text small>{order.deposit_sepa_bank_name}</Text>
                        </FlexRow>
                      ) : null}
                    </FlexCol>
                  </Shadow>
                ) : null}

                {/* SWIFT Bank Deposit */}
                {hasBankDeposit && order.deposit_swift_address && !order.deposit_sepa_address ? (
                  <Shadow fat>
                    <FlexCol gap='0.5rem'>
                      <Text bold>SWIFT Bank Transfer</Text>

                      {order.deposit_swift_address ? (
                        <FlexRow between>
                          <TextSecondary>IBAN:</TextSecondary>
                          <FlexRow gap='0.25rem'>
                            <Text small>{order.deposit_swift_address}</Text>
                            <CopyButton value={order.deposit_swift_address} />
                          </FlexRow>
                        </FlexRow>
                      ) : null}

                      {order.deposit_swift_bic ? (
                        <FlexRow between>
                          <TextSecondary>BIC:</TextSecondary>
                          <FlexRow gap='0.25rem'>
                            <Text small>{order.deposit_swift_bic}</Text>
                            <CopyButton value={order.deposit_swift_bic} />
                          </FlexRow>
                        </FlexRow>
                      ) : null}

                      {order.deposit_swift_beneficiary ? (
                        <FlexRow between>
                          <TextSecondary>Beneficiary:</TextSecondary>
                          <Text small>{order.deposit_swift_beneficiary}</Text>
                        </FlexRow>
                      ) : null}

                      {order.deposit_swift_bank_name ? (
                        <FlexRow between>
                          <TextSecondary>Bank:</TextSecondary>
                          <Text small>{order.deposit_swift_bank_name}</Text>
                        </FlexRow>
                      ) : null}
                    </FlexCol>
                  </Shadow>
                ) : null}

                {/* Transfer Reference Code */}
                {order.transfer_code ? (
                  <Shadow fat border>
                    <FlexCol gap='0.5rem'>
                      <FlexRow between>
                        <Text bold color='red'>
                          Reference (Required)
                        </Text>
                        <CopyButton value={order.transfer_code} />
                      </FlexRow>
                      <Text>{order.transfer_code}</Text>
                      <TextSecondary>
                        You MUST include this reference in your transfer for it to be processed correctly.
                      </TextSecondary>
                    </FlexCol>
                  </Shadow>
                ) : null}
              </FlexCol>
            ) : null}

            {/* Action Buttons */}
            <FlexCol gap='0.5rem'>
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

              {isCompleted || isExpired || isCancelled ? (
                <Button onClick={() => navigate(Pages.AppSwap)} label='Create New Swap' secondary />
              ) : null}
            </FlexCol>
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
