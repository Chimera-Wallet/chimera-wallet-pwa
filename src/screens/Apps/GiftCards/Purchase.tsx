/**
 * Gift Card Purchase Screen
 *
 * Buys a fiat-denominated gift card via ramp-system's POST /gift-card/purchase.
 * Fiat-only — no crypto asset or destination involved (see ramp-system's
 * CLAUDE.md "Gift cards are not an on-ramp destination type").
 */

import { useContext, useState } from 'react'
import Content from '../../../components/Content'
import FlexCol from '../../../components/FlexCol'
import Header from '../../../components/Header'
import Padded from '../../../components/Padded'
import Text, { TextSecondary } from '../../../components/Text'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import Shadow from '../../../components/Shadow'
import ErrorMessage from '../../../components/Error'
import Info from '../../../components/Info'
import { SepaDataView, SwiftDataView, TransferReferenceBox, BankCurrencySelector } from '../../../components/BankDetails'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { purchaseGiftCard, type RampOrder, type RampBankDetails } from '../../../providers/ramp'
import { getSupportedReceiveCurrencies, type BankCurrency } from '../../../lib/bankTransferConfig'
import { getUserEmailForBankTransfer, getKycEmail } from '../../../lib/kyc'
import { prettyNumber } from '../../../lib/format'

export default function GiftCardPurchase() {
  const { navigate, goBack } = useContext(NavigationContext)

  const [currency, setCurrency] = useState<BankCurrency>('EUR')
  const [amount, setAmount] = useState<string>('')
  const [recipientEmail, setRecipientEmail] = useState<string>(getKycEmail() ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [order, setOrder] = useState<RampOrder | null>(null)
  const [bankDetails, setBankDetails] = useState<RampBankDetails | null>(null)

  const numAmount = parseFloat(amount) || 0
  const canSubmit = numAmount > 0 && !loading

  const handlePurchase = async () => {
    try {
      setLoading(true)
      setError('')

      const email = getUserEmailForBankTransfer()
      const response = await purchaseGiftCard({
        fiat_currency: currency,
        fiat_amount: amount,
        email,
        recipient_email: recipientEmail || undefined,
        origin: 'app',
      })

      setOrder(response.order)
      setBankDetails(response.bank_details)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create gift card order')
    } finally {
      setLoading(false)
    }
  }

  if (order && bankDetails) {
    const DataView = bankDetails.payment_type === 'swift' ? SwiftDataView : SepaDataView

    return (
      <>
        <Header text='Gift Card' back={goBack} />
        <Content>
          <Padded>
            <FlexCol gap='1.5rem'>
              <Info color='blue' title='Send Bank Transfer'>
                <TextSecondary>
                  Transfer {prettyNumber(numAmount, 2)} {currency} to the bank details below. Your gift card code will
                  be emailed to {recipientEmail || 'you'} once the payment is confirmed.
                </TextSecondary>
              </Info>

              <TransferReferenceBox reference={bankDetails.transfer_code} />

              <FlexCol gap='0.5rem'>
                <DataView
                  iban={bankDetails.iban}
                  bic={bankDetails.bic}
                  beneficiary={bankDetails.beneficiary}
                  bankName={bankDetails.bank_name}
                />
              </FlexCol>
            </FlexCol>
          </Padded>
        </Content>
        <ButtonsOnBottom>
          <Button label='Done' onClick={() => navigate(Pages.AppGiftCards)} />
        </ButtonsOnBottom>
      </>
    )
  }

  return (
    <>
      <Header text='Buy a Gift Card' back={goBack} />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
            <ErrorMessage error={Boolean(error)} text={error} />

            <FlexCol gap='0.5rem'>
              <Text tiny color='neutral-500'>
                Currency
              </Text>
              <BankCurrencySelector selectedCurrency={currency} onSelect={setCurrency} currencies={getSupportedReceiveCurrencies()} />
            </FlexCol>

            <FlexCol gap='0.5rem'>
              <Shadow input>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <Text tiny color='neutral-500'>
                    Amount ({currency})
                  </Text>
                  <input
                    type='text'
                    inputMode='decimal'
                    value={amount}
                    onChange={(e) => {
                      if (/^\d*\.?\d*$/.test(e.target.value)) setAmount(e.target.value)
                    }}
                    placeholder='100'
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--white)',
                      fontSize: '1.25rem',
                      fontWeight: 'bold',
                      outline: 'none',
                    }}
                  />
                </div>
              </Shadow>
            </FlexCol>

            <FlexCol gap='0.5rem'>
              <Shadow input>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%' }}>
                  <Text tiny color='neutral-500'>
                    Recipient Email (optional — defaults to you)
                  </Text>
                  <input
                    type='email'
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder='friend@example.com'
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--white)',
                      fontSize: '1rem',
                      outline: 'none',
                    }}
                  />
                </div>
              </Shadow>
            </FlexCol>
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button
          label={loading ? 'Creating Order...' : 'Continue'}
          onClick={handlePurchase}
          disabled={!canSubmit}
          loading={loading}
        />
      </ButtonsOnBottom>
    </>
  )
}
