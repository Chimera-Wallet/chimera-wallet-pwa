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
import { useTranslation } from 'react-i18next'


const POLL_INTERVAL = 8000

const formatBaseUnits = (value: string | null, precision: number): string => {
  if (!value) return ''
  return new Decimal(value).div(new Decimal(10).pow(precision)).toString()
}


export default function UnwrapSend() {
  const { t } = useTranslation()
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



  const statusLabel = (status: WrapQuote['status']): string => {
    switch (status) {
      case 'pending':
        return t('common.notifications.unwrapService.pending')
      case 'deposited':
        return t('common.notifications.unwrapService.deposited')
      case 'processing':
        return t('common.notifications.unwrapService.processing')
      case 'completed':
        return t('common.notifications.unwrapService.completed')
      case 'expired':
        return t('common.notifications.unwrapService.expired')
      case 'failed':
        return t('common.notifications.unwrapService.failed')
    }
  }
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
            notifyResult(true, t('common.notifications.unwrapService.sent'))
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
      setError(t('errors.send.chain.invalidAddress' ,{chain: chain.name}))
      return
    }
    if (!sender) {
      setError(t('errors.send.arkade.addressUnable'))
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
      notifyResult(false, t('common.notifications.unwrapService.failedQuote'))
    } finally {
      setLoading(false)
    }
  }

  if (completed) {
    const amount = formatBaseUnits(quote?.payout_amount ?? null, precision)
    return (
      <>
        <Header text= {t('common.general.success')} />
        <Content>
          <Success
            headline={t('common.notifications.unwrapService.completeHeadline')} 
            text={amount ? t('common.notifications.unwrapService.sendInfo', {value:amount, ticker: unwrapSendInfo.ticker, name: chain.name}) : t('common.notifications.unwrapService.sent')}
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
      <Header text={t('common.notifications.unwrapService.sendHeader', {ticker: unwrapSendInfo.ticker, name: chain.name})} back={goBack} />
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
                    text={t('common.notifications.unwrapService.sendInfoExtended', {name:chain.name, ticker: unwrapSendInfo.ticker})}
                  />
                </InfoContainer>
                <Input
                  label={t('common.notifications.unwrapService.destination', {name: chain.name})}
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
                    text={t('common.notifications.unwrapService.timeSensitive', {ticker: unwrapSendInfo.ticker})}
                  />
                  {quote.payout_amount ? (
                    <InfoLine compact text={t('common.notifications.unwrapService.payout', {amount: formatBaseUnits(quote.payout_amount, precision),  ticker: unwrapSendInfo.ticker})} />
                  ) : null}
                </InfoContainer>
                <FlexCol centered gap='0.75rem'>
                  <QrCode value={quote.treasury} />
                  <div
                    style={{ wordBreak: 'break-all', textAlign: 'center', fontSize: '13px', cursor: 'pointer' }}
                    onClick={() => navigator.clipboard?.writeText(quote.treasury)}
                    title={t('common.general.tapCopy')}
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
          <Button label={loading ? t('common.general.reserving') : t('common.general.continue')} onClick={handleCreateQuote} disabled={loading || !receiver} />
        ) : (
          <Button label='Done' onClick={() => navigate(Pages.Wallet)} secondary />
        )}
      </ButtonsOnBottom>
    </>
  )
}
