/**
 * Wrap Receive Screen (native chain -> Arkade)
 *
 * The user deposits a native/token asset on an EVM/TRON chain to a treasury
 * address reserved by the Arkade Wrap (Typhoon) bridge. Once the deposit is
 * observed and confirmed, the equivalent Arkade-native wrapped asset is minted
 * to the wallet's Arkade address.
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
  createWrapQuote,
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
      return 'Waiting for your deposit…'
    case 'deposited':
      return 'Deposit detected, confirming…'
    case 'processing':
      return 'Minting your wrapped asset…'
    case 'completed':
      return 'Completed'
    case 'expired':
      return 'This quote has expired'
    case 'failed':
      return 'The wrap failed'
  }
}

export default function WrapReceive() {
  const { navigate, goBack } = useContext(NavigationContext)
  const { wrapRecvInfo, setWrapRecvInfo } = useContext(FlowContext)
  const { svcWallet } = useContext(WalletContext)
  const { notifyResult } = useContext(TxResultContext)

  const [receiver, setReceiver] = useState<string>(wrapRecvInfo?.receiver ?? '')
  const [sender, setSender] = useState<string>(wrapRecvInfo?.sender ?? '')
  const [quote, setQuote] = useState<WrapQuote | undefined>(wrapRecvInfo?.quote)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [completed, setCompleted] = useState(false)

  const chain = wrapRecvInfo ? requireSourceChain(wrapRecvInfo.chainId) : undefined
  const assetConfig = wrapRecvInfo ? requireAssetConfig(wrapRecvInfo.assetSymbol) : undefined

  // Redirect out if we somehow got here without a selection.
  useEffect(() => {
    if (!wrapRecvInfo) navigate(Pages.ReceiveAmount)
  }, [wrapRecvInfo])

  if (!wrapRecvInfo || !chain || !assetConfig) return <Loading text='Loading...' />

  const precision = assetConfig.precision

  // Load the Arkade receiving address (mint destination).
  useEffect(() => {
    if (!svcWallet || receiver) return
    getReceivingAddresses(svcWallet)
      .then(({ offchainAddr }) => setReceiver(offchainAddr))
      .catch((err) => {
        consoleError(err, 'error getting ark address')
        setError(extractError(err))
      })
  }, [svcWallet])

  // Poll the quote until it reaches a terminal state.
  const pollRef = useRef<ReturnType<typeof setInterval>>()
  useEffect(() => {
    if (!quote || isTerminalWrapStatus(quote.status)) return
    pollRef.current = setInterval(() => {
      getWrapQuote(quote.id)
        .then((updated) => {
          setQuote(updated)
          if (wrapRecvInfo) setWrapRecvInfo({ ...wrapRecvInfo, sender, receiver, quote: updated })
          if (updated.status === 'completed') {
            setCompleted(true)
            notifyResult(true, 'Wrapped asset received')
          }
          if (isTerminalWrapStatus(updated.status) && pollRef.current) clearInterval(pollRef.current)
        })
        .catch((err) => consoleError(err, 'error polling wrap quote'))
    }, POLL_INTERVAL)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [quote?.id, quote?.status])

  const handleCreateQuote = async () => {
    if (!chain.isValidAddress(sender)) {
      setError(`Enter a valid ${chain.name} address`)
      return
    }
    if (!receiver) {
      setError('Unable to get your Arkade receiving address')
      return
    }
    try {
      setLoading(true)
      setError('')
      const created = await createWrapQuote({
        chain: wrapRecvInfo.chainId,
        ticker: wrapRecvInfo.ticker,
        sender: sender.trim(),
        receiver,
      })
      setQuote(created)
      setWrapRecvInfo({ ...wrapRecvInfo, sender: sender.trim(), receiver, quote: created })
    } catch (err) {
      setError(extractError(err))
      notifyResult(false, 'Failed to create wrap quote')
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
            headline='Wrap completed!'
            text={amount ? `${amount} ${wrapRecvInfo.ticker} received on Arkade` : 'Your wrapped asset was received'}
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
      <Header text={`Receive ${wrapRecvInfo.ticker} via ${chain.name}`} back={goBack} />
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
                    text={`Enter the ${chain.name} address you will send ${wrapRecvInfo.ticker} from. We reserve a deposit address and mint the equivalent wrapped asset to your Arkade wallet.`}
                  />
                </InfoContainer>
                <Input
                  label={`Your ${chain.name} address`}
                  value={sender}
                  onChange={setSender}
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
                    text={`Send ${wrapRecvInfo.ticker} on ${chain.name} to the address below before the quote expires.`}
                  />
                  {quote.amount ? (
                    <InfoLine compact text={`Deposit detected: ${formatBaseUnits(quote.amount, precision)} ${wrapRecvInfo.ticker}`} />
                  ) : null}
                  {quote.fee_amount ? (
                    <InfoLine compact text={`Bridge fee: ${formatBaseUnits(quote.fee_amount, precision)} ${wrapRecvInfo.ticker}`} />
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
          <Button label={loading ? 'Reserving…' : 'Get deposit address'} onClick={handleCreateQuote} disabled={loading || !sender} />
        ) : (
          <Button label='Done' onClick={() => navigate(Pages.Wallet)} secondary />
        )}
      </ButtonsOnBottom>
    </>
  )
}
