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
import {useTranslation} from 'react-i18next'

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
  const {t} = useTranslation()

  // Fetch order status on mount and periodically
  useEffect(() => {
    if (!swapOrderInfo?.id && !order?.id) {
      setLoading(false)
      setError(t('errors.swap.noInfo'))
      return
    }

    const orderId = swapOrderInfo?.id || order?.id

    const fetchStatus = async () => {
      try {
        const orderData = await getOrderStatus(orderId)
        setOrder(orderData)
        setError('')
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errors.swap.failedLoad'))
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
      setError(err instanceof Error ? err.message : t('errors.swap.failedRefresh'))
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
        <Header text={t('apps.swap.orderDet')} back={handleBack} />
        <Content>
          <Loading text={t('apps.swap.loading')} />
        </Content>
      </>
    )
  }

  if (error || !order) {
    return (
      <>
        <Header text={t('apps.swap.orderDet')} back={handleBack} />
        <Content>
          <Padded>
            <FlexCol gap='1rem'>
              <ErrorMessage error text={error || t('apps.swap.orderMiss')} />
              <Button onClick={handleBack} label={t('apps.swap.backSwap')} />
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
    [t('apps.swap.orderId'), order.id],
    [t('common.general.status'), order.status.replace(/_/g, ' ')],
    [t('common.general.from'), `${order.from_amount} ${order.from_asset}`],
    [t('common.general.to'), order.to_asset],
    [t('common.general.created'), prettyDate(new Date(order.created_at).getTime())],
  ]

  if (order.expires_at && isWaitingForDeposit) {
    tableData.push([t('common.general.expires'), prettyDate(new Date(order.expires_at).getTime())])
  }

  if (order.deposit_amount) {
    tableData.push([t('common.general.depositAm'), order.deposit_amount])
  }

  // Determine deposit address/info to show
  const depositAddress = order.deposit_crypto_address
  const hasCryptoDeposit = Boolean(depositAddress)
  const hasBankDeposit = Boolean(order.deposit_sepa_address || order.deposit_swift_address)

  return (
    <>
      <Header text={t('apps.swap.orderDet')} back={handleBack} />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
            {/* Status Banner */}
            {isCompleted ? (
              <Info color='green' icon={<CheckMarkIcon small />} title={t('apps.swap.orderComp')}>
                <TextSecondary>{t('apps.swap.swapSucc')}</TextSecondary>
              </Info>
            ) : null}

            {isExpired ? (
              <Info color='red' title={t('apps.swap.orderExp')}>
                <TextSecondary>{t('apps.swap.orderExpDesc')}</TextSecondary>
              </Info>
            ) : null}

            {isCancelled ? (
              <Info color='red' title={t('apps.swap.orderCanc')}>
                <TextSecondary>{t('apps.swap.orderCancDescr')}.</TextSecondary>
              </Info>
            ) : null}

            {isProcessing ? (
              <Info color='yellow' title={t('apps.swap.processing')}>
                <TextSecondary>{t('apps.swap.depositRec')}.</TextSecondary>
              </Info>
            ) : null}

            {/* Order Details Table */}
            <Table data={tableData} />

            {/* Deposit Information for Waiting Orders */}
            {isWaitingForDeposit ? (
              <FlexCol gap='1rem'>
                <TextLabel>{t('apps.swap.depositInstr')}</TextLabel>

                {/* Crypto Deposit */}
                {hasCryptoDeposit && depositAddress ? (
                  <FlexCol gap='0.75rem'>
                    <Shadow fat>
                      <FlexCol gap='0.5rem'>
                        <Text bold>{t('apps.swap.sendTo', {asset: order.from_asset})}</Text>
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
                      <Text bold>{t('apps.swap.sepa')}</Text>

                      {order.deposit_sepa_address ? (
                        <FlexRow between>
                          <TextSecondary>{t('apps.swap.iban')}</TextSecondary>
                          <FlexRow gap='0.25rem'>
                            <Text small>{order.deposit_sepa_address}</Text>
                            <CopyButton value={order.deposit_sepa_address} />
                          </FlexRow>
                        </FlexRow>
                      ) : null}

                      {order.deposit_sepa_bic ? (
                        <FlexRow between>
                          <TextSecondary>{t('apps.swap.bic')}</TextSecondary>
                          <FlexRow gap='0.25rem'>
                            <Text small>{order.deposit_sepa_bic}</Text>
                            <CopyButton value={order.deposit_sepa_bic} />
                          </FlexRow>
                        </FlexRow>
                      ) : null}

                      {order.deposit_sepa_beneficiary ? (
                        <FlexRow between>
                          <TextSecondary>{t('apps.swap.benef')}</TextSecondary>
                          <Text small>{order.deposit_sepa_beneficiary}</Text>
                        </FlexRow>
                      ) : null}

                      {order.deposit_sepa_bank_name ? (
                        <FlexRow between>
                          <TextSecondary>{t('apps.swap.bank')}</TextSecondary>
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
                      <Text bold>{t('apps.swap.swift')}</Text>

                      {order.deposit_swift_address ? (
                        <FlexRow between>
                          <TextSecondary>{t('apps.swap.bank')}</TextSecondary>
                          <FlexRow gap='0.25rem'>
                            <Text small>{order.deposit_swift_address}</Text>
                            <CopyButton value={order.deposit_swift_address} />
                          </FlexRow>
                        </FlexRow>
                      ) : null}

                      {order.deposit_swift_bic ? (
                        <FlexRow between>
                          <TextSecondary>{t('apps.swap.bic')}</TextSecondary>
                          <FlexRow gap='0.25rem'>
                            <Text small>{order.deposit_swift_bic}</Text>
                            <CopyButton value={order.deposit_swift_bic} />
                          </FlexRow>
                        </FlexRow>
                      ) : null}

                      {order.deposit_swift_beneficiary ? (
                        <FlexRow between>
                          <TextSecondary>{t('apps.swap.benef')}</TextSecondary>
                          <Text small>{order.deposit_swift_beneficiary}</Text>
                        </FlexRow>
                      ) : null}

                      {order.deposit_swift_bank_name ? (
                        <FlexRow between>
                          <TextSecondary>{t('apps.swap.bank')}</TextSecondary>
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
                          {t('apps.swap.ref')}
                        </Text>
                        <CopyButton value={order.transfer_code} />
                      </FlexRow>
                      <Text>{order.transfer_code}</Text>
                      <TextSecondary>
                        {t('apps.swap.mustIncl')}
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
                  label={refreshing ? t('apps.swap.refresh') : t('apps.swap.refreshStat')}
                  secondary
                  disabled={refreshing}
                  loading={refreshing}
                />
              ) : null}

              <Button onClick={handleBackToWallet} label={t('apps.swap.backToWal')} />

              {isCompleted || isExpired || isCancelled ? (
                <Button onClick={() => navigate(Pages.AppSwap)} label={t('apps.swap.createSwap')}secondary />
              ) : null}
            </FlexCol>
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
