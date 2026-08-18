import Content from '../../components/Content'
import Header from '../../components/Header'
import TransactionsList from '../../components/TransactionsList'
import {useTranslation} from 'react-i18next'

export default function Transactions() {
  const {t} = useTranslation()
  return (
    <>
      <Header text={t('networks.transactions.allTransactions')} back />
      <Content>
        <TransactionsList />
      </Content>
    </>
  )
}
