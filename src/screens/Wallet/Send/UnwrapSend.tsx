/**
 * Unwrap Send Screen (Arkade -> native chain)
 *
 * Burns an Arkade-native wrapped asset and pays out the underlying native/token
 * on the destination EVM/TRON chain. The user enters the destination address,
 * we reserve an Arkade treasury deposit address, and once the wrapped asset is
 * deposited to it the bridge sends the payout on the destination chain.
 */

import { useContext, useEffect, useRef, useState } from 'react'
import Decimal from 'decimal.js'
import Content from '../../../components/Content'
import Header from '../../../components/Header'
import Padded from '../../../components/Padded'
import FlexCol from '../../../components/FlexCol'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import ErrorMessage from '../../../components/Error'
import Input from '../../../components/Input'
import InfoContainer from '../../../components/InfoContainer'
import { InfoLine } from '../../../components/Info'
import QrCode from '../../../components/QrCode'
import Loading from '../../../components/Loading'
import Success from '../../../components/Success'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { FlowContext } from '../../../providers/flow'
import { WalletContext } from '../../../providers/wallet'
import { TxResultContext } from '../../../providers/txResult'
import { getReceivingAddresses } from '../../../lib/asp'
import { extractError } from '../../../lib/error'
import { consoleError } from '../../../lib/logs'
import { requireAssetConfig } from '../../../lib/assets'
import { requireSourceChain } from '../../../lib/sourceChains'
import {
  createUnwrapQuote,
  getWrapQuote,
  isTerminalWrapStatus,
  type WrapQuote,
} from '../../../lib/arkadeWrap'

const POLL_INTERVAL = 8000

const formatBaseUnits = (value: string | null, precision: number): string => {
  if (!value) return ''
  return new Decimal(value).div(new Decimal(10).pow(precision)).toString()
}

const statusLabel = (status: WrapQuote['status']): string => {
  switch (status) {
    case 'pending':
      return 'Waiting for your Arkade deposit…'
    case 'deposited':
      return 'Deposit detected, confirming…'
    case 'processing':
      return 'Sending your payout…'
    case 'completed':
      return 'Completed'
    case 'expired':
      return 'This quote has expired'
    case 'failed':
      return 'The unwrap failed'
  }
}

export default function UnwrapSend() {
  const { navigate, goBack } = useContext(NavigationContext)
  const { unwrapSendInfo, setUnwrapSendInfo } = useContext(FlowContext)
  const { svcWallet } = useContext(WalletContext)
  const { notifyResult } = useContext(TxResultContext)

  const [sender, setSender] = useState<string>(unwrapSendInfo?.sender ?? '')
  const [receiver, setReceiver] = useState<string>(unwrapSendInfo?.receiver ?? '')
  const [quote, setQuote] = useState<WrapQuote | undefined>(unwrapSendInfo?.quote)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [completed, setCompleted] = useState(false)

  const chain = unwrapSendInfo ? requireSourceChain(unwrapSendInfo.chainId) : undefined
  const assetConfig = unwrapSendInfo ? requireAssetConfig(unwrapSendInfo.assetSymbol) : undefined

  useEffect(() => {
    if (!unwrapSendInfo) navigate(Pages.SendForm)
  }, [unwrapSendInfo])

  if (!unwrapSendInfo || !chain || !assetConfig) return <Loading text='Loading...' />

  const precision = assetConfig.precision

  // Load the Arkade address that will deposit the wrapped asset.
  useEffect(() => {
    if (!svcWallet || sender) return
    getReceivingAddresses(svcWallet)
      .then(({ offchainAddr }) => setSender(offchainAddr))
      .catch((err) => {
        consoleError(err, 'error getting ark address')
        setError(extractError(err))
      })
  }, [svcWallet])

  const pollRef = useRef<ReturnType<typeof setInterval>>()
  useEffect(() => {
    if (!quote || isTerminalWrapStatus(quote.status)) return
    pollRef.current = setInterval(() => {
      getWrapQuote(quote.id)
        .then((updated) => {
          setQuote(updated)
          if (unwrapSendInfo) setUnwrapSendInfo({ ...unwrapSendInfo, sender, receiver, quote: updated })
          if (updated.status === 'completed') {
            setCompleted(true)
            notifyResult(true, 'Payout sent')
          }
          if (isTerminalWrapStatus(updated.status) && pollRef.current) clearInterval(pollRef.current)
        })
        .catch((err) => consoleError(err, 'error polling unwrap quote'))
    }, POLL_INTERVAL)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [quote?.id, quote?.status])

  const handleCreateQuote = async () => {
    if (!chain.isValidAddress(receiver)) {
      setError(`Enter a valid ${chain.name} address`)
      return
    }
    if (!sender) {
      setError('Unable to get your Arkade address')
      return
    }
    try {
      setLoading(true)
      setError('')
      const created = await createUnwrapQuote({
        chain: unwrapSendInfo.chainId,
        ticker: unwrapSendInfo.ticker,
        sender,
        receiver: receiver.trim(),
      })
      setQuote(created)
      setUnwrapSendInfo({ ...unwrapSendInfo, sender, receiver: receiver.trim(), quote: created })
    } catch (err) {
      setError(extractError(err))
      notifyResult(false, 'Failed to create unwrap quote')
    } finally {
      setLoading(false)
    }
  }

  if (completed) {
    const amount = formatBaseUnits(quote?.payout_amount ?? null, precision)
    return (
      <>
        <Header text='Success' />
        <Content>
          <Success
            headline='Unwrap completed!'
            text={amount ? `${amount} ${unwrapSendInfo.ticker} sent on ${chain.name}` : 'Your payout was sent'}
          />
        </Content>
        <ButtonsOnBottom>
          <Button label='Done' onClick={() => navigate(Pages.Wallet)} />
        </ButtonsOnBottom>
      </>
    )
  }

  return (
    <>
      <Header text={`Send ${unwrapSendInfo.ticker} to ${chain.name}`} back={goBack} />
      <Content>
        <Padded>
          <FlexCol gap='1rem'>
            <ErrorMessage error={Boolean(error)} text={error} />

            {!quote ? (
              <>
                <InfoContainer>
                  <InfoLine
                    compact
                    color='orange'
                    text={`Enter the ${chain.name} address that will receive the payout. We reserve an Arkade deposit address; sending your wrapped ${unwrapSendInfo.ticker} to it releases the funds on ${chain.name}.`}
                  />
                </InfoContainer>
                <Input
                  label={`Destination ${chain.name} address`}
                  value={receiver}
                  onChange={setReceiver}
                  placeholder={chain.addressPlaceholder}
                />
              </>
            ) : (
              <>
                <InfoContainer>
                  <InfoLine compact text={statusLabel(quote.status)} />
                  <InfoLine
                    compact
                    color='orange'
                    text={`Send your wrapped ${unwrapSendInfo.ticker} on Arkade to the treasury address below before the quote expires.`}
                  />
                  {quote.payout_amount ? (
                    <InfoLine compact text={`Payout: ${formatBaseUnits(quote.payout_amount, precision)} ${unwrapSendInfo.ticker}`} />
                  ) : null}
                </InfoContainer>
                <FlexCol centered gap='0.75rem'>
                  <QrCode value={quote.treasury} />
                  <div
                    style={{ wordBreak: 'break-all', textAlign: 'center', fontSize: '13px', cursor: 'pointer' }}
                    onClick={() => navigator.clipboard?.writeText(quote.treasury)}
                    title='Tap to copy'
                  >
                    {quote.treasury}
                  </div>
                </FlexCol>
              </>
            )}
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        {!quote ? (
          <Button label={loading ? 'Reserving…' : 'Continue'} onClick={handleCreateQuote} disabled={loading || !receiver} />
        ) : (
          <Button label='Done' onClick={() => navigate(Pages.Wallet)} secondary />
        )}
      </ButtonsOnBottom>
    </>
  )
}
