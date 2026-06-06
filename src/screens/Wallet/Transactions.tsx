import Content from '../../components/Content'
import Header from '../../components/Header'
import TransactionsList from '../../components/TransactionsList'

export default function Transactions() {
  return (
    <>
      <Header text='All Transactions' back />
      <Content>
        <TransactionsList />
      </Content>
    </>
  )
}
