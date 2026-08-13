/**
 * Bank Order History Screen
 *
 * Shows a list of all bank transfer orders (deposits and withdrawals)
 */

import { useContext, useState, useEffect } from 'react'
import Content from '../../components/Content'
import FlexCol from '../../components/FlexCol'
import Header from '../../components/Header'
import Padded from '../../components/Padded'
import Text, { TextSecondary } from '../../components/Text'
import Shadow from '../../components/Shadow'
import CenterScreen from '../../components/CenterScreen'
import { NavigationContext, Pages } from '../../providers/navigation'
import { FlowContext } from '../../providers/flow'
import { prettyDate } from '../../lib/format'
import FlexRow from '../../components/FlexRow'
import TransactionsIcon from '../../icons/Transactions'
import { getBankOrderHistory, BankOrderHistoryEntry, type BankOrderType } from '../../lib/bankOrderHistory'
import { useTranslation } from 'react-i18next'

export default function BankOrderHistory() {
  const { navigate, goBack } = useContext(NavigationContext)
  const { bankRecvInfo, bankSendInfo, setCurrentBankOrderType, setBankRecvInfo, setBankStatusOrder } =
    useContext(FlowContext)

  // Load order history from localStorage
  const [orderHistory, setOrderHistory] = useState<BankOrderHistoryEntry[]>([])

  useEffect(() => {
    // Load history on mount
    setOrderHistory(getBankOrderHistory())
  }, [])

  const handleOrderClick = (orderId: string, orderType: BankOrderType) => {
    const historyEntry = orderHistory.find((h) => h.order.id === orderId)
    if (!historyEntry) return

    // Store the order in the dedicated status-view field (not bankRecvInfo) so
    // BankReceive is not affected when the user navigates back to it.
    setBankStatusOrder(historyEntry.order)
    setCurrentBankOrderType(orderType)
    if (orderType === 'receive' && historyEntry.circuit) {
      setBankRecvInfo({ ...bankRecvInfo, circuit: historyEntry.circuit })
    }

    navigate(Pages.BankOrderStatus)
  }

  const getStatusColor = (status: string) => {
    if (status === 'COMPLETED' || status === 'APPROVED') return 'var(--success)'
    if (status === 'WAITING_FOR_DEPOSIT') return 'var(--info)'
    if (['DEPOSIT_RECEIVED', 'DEPOSIT_CONFIRMED', 'PROCESSING'].includes(status)) return 'var(--warning)'
    if (['EXPIRED', 'CANCELLED', 'REJECTED'].includes(status)) return 'var(--error)'
    return 'var(--text-secondary)'
  }

  const getOrderTypeLabel = (type: BankOrderType) => {
    return type === 'receive' ? 'Deposit' : 'Withdrawal'
  }

  const {t} = useTranslation() 

  if (orderHistory.length === 0) {
    return (
      <>
        <Header text={t('common.general.bank.orderHistory')} back={goBack} />
        <Content>
          <CenterScreen>
            <FlexCol centered gap='1rem'>
              <TransactionsIcon />
              <FlexCol centered gap='0.5rem'>
                <Text heading>{t('common.general.bank.noOrders')}</Text>
                <TextSecondary>{t('common.general.bank.orderAppear')}</TextSecondary>
              </FlexCol>
            </FlexCol>
          </CenterScreen>
        </Content>
      </>
    )
  }

  return (
    <>
      <Header text={t('common.general.bank.orderHistory')} back={goBack} />
      <Content>
        <Padded>
          <FlexCol gap='1rem'>
            {orderHistory.map((entry) => (
              <Shadow key={entry.order.id} onClick={() => handleOrderClick(entry.order.id, entry.type)}>
                <FlexCol gap='0.5rem'>
                  <FlexRow gap='0.5rem'>
                    <FlexCol gap='0.25rem'>
                      <Text bold>{getOrderTypeLabel(entry.type)}</Text>
                      <TextSecondary small>{prettyDate(entry.timestamp)}</TextSecondary>
                    </FlexCol>
                    <FlexCol gap='0.25rem'>
                      <Text bold>
                        {entry.order.from_amount} {entry.order.from_asset}
                      </Text>
                      <Text small color={getStatusColor(entry.order.status)}>
                        {entry.order.status.replace(/_/g, ' ')}
                      </Text>
                    </FlexCol>
                  </FlexRow>
                  <FlexRow gap='0.5rem'>
                    <TextSecondary small>{t('common.general.bank.orderNumber', {id: entry.order.id.slice(0, 8)})}</TextSecondary>
                    <TextSecondary small>→ {entry.order.to_asset}</TextSecondary>
                  </FlexRow>
                </FlexCol>
              </Shadow>
            ))}
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
