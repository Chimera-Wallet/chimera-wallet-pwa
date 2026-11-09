/**
 * Unwrap Send Screen (Arkade -> native chain).
 * Collect the destination, then the amount, and fund the bridge from this wallet.
 */

import { useContext, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Content from '../../../components/Content'
import Header from '../../../components/Header'
import Padded from '../../../components/Padded'
import FlexCol from '../../../components/FlexCol'
import FlexRow from '../../../components/FlexRow'
import Text from '../../../components/Text'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import ErrorMessage from '../../../components/Error'
import Input from '../../../components/Input'
import InlineAmountInput from '../../../components/InlineAmountInput'
import InfoContainer from '../../../components/InfoContainer'
import { InfoLine } from '../../../components/Info'
import Loading from '../../../components/Loading'
import Success from '../../../components/Success'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { FlowContext, type UnwrapSendInfo } from '../../../providers/flow'
import { WalletContext } from '../../../providers/wallet'
import { TxResultContext } from '../../../providers/txResult'
import { getReceivingAddresses, sendAssets } from '../../../lib/asp'
import { extractError } from '../../../lib/error'
import { consoleError } from '../../../lib/logs'
import {
  BALANCE_DISPLAY_DECIMALS,
  centsToUnits,
  getWrappedAssetId,
  prettyAssetAmount,
  requireAssetConfig,
  type AssetSymbol,
} from '../../../lib/assets'
import { requireSourceChain } from '../../../lib/sourceChains'
import { formatBaseUnits } from '../../../lib/format'
import { saveTransactionActivityMetadata } from '../../../lib/storage'
import {
  SERVICE_FEE_PERCENT,
  createUnwrapQuote,
  getWrapQuote,
  isTerminalWrapStatus,
  type WrapQuote,
} from '../../../lib/arkadeWrap'

const POLL_INTERVAL = 8000

const statusLabel = (status: WrapQuote['status']): string => `common.notifications.unwrapService.${status}`

const minAmountOf = (quote?: WrapQuote): bigint => (quote?.min_amount ? BigInt(quote.min_amount) : BigInt(0))

const prettyMinAmount = (minAmount: bigint, precision: number): string => {
  const step = BigInt(10) ** BigInt(Math.max(0, precision - BALANCE_DISPLAY_DECIMALS))
  return prettyAssetAmount(((minAmount + step - BigInt(1)) / step) * step, precision)
}

export default function UnwrapSend() {
  const { t } = useTranslation()
  const { navigate, goBack } = useContext(NavigationContext)
  const { unwrapSendInfo, setUnwrapSendInfo } = useContext(FlowContext)
  const { assetBalances, assetMetadataCache, svcWallet } = useContext(WalletContext)
  const { notifyResult } = useContext(TxResultContext)

  const [receiver, setReceiver] = useState(unwrapSendInfo?.receiver ?? '')
  const [step, setStep] = useState<'address' | 'amount'>(
    unwrapSendInfo?.amount !== undefined || unwrapSendInfo?.quote ? 'amount' : 'address',
  )
  const [error, setError] = useState('')
  const [quoteRequest, setQuoteRequest] = useState<'idle' | 'loading' | 'failed'>('idle')
  const sendingRef = useRef(false)
  const notifiedQuote = useRef<string>()

  const sender = unwrapSendInfo?.sender ?? ''
  const amount = unwrapSendInfo?.amount ?? BigInt(0)
  const quote = unwrapSendInfo?.quote
  const txid = unwrapSendInfo?.txid
  const sending = Boolean(unwrapSendInfo?.fundingId)
  const chain = unwrapSendInfo ? requireSourceChain(unwrapSendInfo.chainId) : undefined
  const assetConfig = unwrapSendInfo ? requireAssetConfig(unwrapSendInfo.assetSymbol) : undefined
  const assetId = unwrapSendInfo ? getWrappedAssetId(unwrapSendInfo.assetSymbol) : undefined
  const precision =
    (assetId ? assetMetadataCache.get(assetId)?.metadata?.decimals : undefined) ?? assetConfig?.precision ?? 8
  const availableBalance = assetBalances.find((asset) => asset.assetId === assetId)?.amount ?? BigInt(0)
  const depositStarted = Boolean(
    txid || quote?.deposit_tx_hash || (quote && quote.status !== 'pending' && quote.status !== 'expired'),
  )
  const receiverSet = unwrapSendInfo?.receiver
  const needsQuote =
    step === 'amount' &&
    !depositStarted &&
    !sending &&
    Boolean(sender && receiverSet) &&
    (!quote || quote.status === 'expired')
  const awaitingQuote = needsQuote && quoteRequest !== 'failed'

  useEffect(() => {
    if (!unwrapSendInfo) navigate(Pages.SendForm)
  }, [unwrapSendInfo, navigate])

  useEffect(() => {
    if (!svcWallet || sender) return
    let active = true
    getReceivingAddresses(svcWallet)
      .then(({ offchainAddr }) => {
        if (!active) return
        setUnwrapSendInfo((prev) => (prev ? { ...prev, sender: offchainAddr } : prev))
      })
      .catch((err) => {
        if (!active) return
        consoleError(err, 'error getting ark address')
        setError(extractError(err))
      })
    return () => {
      active = false
    }
  }, [svcWallet, sender, setUnwrapSendInfo])

  // The minimum unwrap amount only comes with a quote, so reserve one as soon as
  // the destination is set. handleSend still refreshes it before funding.
  useEffect(() => {
    if (!needsQuote || !unwrapSendInfo) return
    const { chainId, ticker, receiver: destination } = unwrapSendInfo
    let active = true
    setQuoteRequest('loading')
    createUnwrapQuote({ chain: chainId, ticker, sender, receiver: destination })
      .then((created) => {
        if (!active) return
        setQuoteRequest('idle')
        setUnwrapSendInfo((prev) =>
          prev?.receiver === destination && !prev.fundingId && !prev.txid ? { ...prev, quote: created } : prev,
        )
      })
      .catch((err) => {
        if (!active) return
        consoleError(err, 'error creating unwrap quote')
        setQuoteRequest('failed')
        setError(extractError(err))
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsQuote, sender, receiverSet, unwrapSendInfo?.chainId, unwrapSendInfo?.ticker, setUnwrapSendInfo])

  // Pause polling during funding so an older response cannot race the send.
  useEffect(() => {
    if (!quote || isTerminalWrapStatus(quote.status) || sending) return
    let active = true
    let polling = false
    const interval = setInterval(async () => {
      if (polling) return
      polling = true
      try {
        const updated = await getWrapQuote(quote.id)
        if (!active) return
        setUnwrapSendInfo((prev) => (prev?.quote?.id === updated.id ? { ...prev, quote: updated } : prev))
      } catch (err) {
        consoleError(err, 'error polling unwrap quote')
      } finally {
        polling = false
      }
    }, POLL_INTERVAL)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [quote?.id, quote?.status, sending, setUnwrapSendInfo])

  useEffect(() => {
    if (quote?.status !== 'completed' || notifiedQuote.current === quote.id) return
    notifiedQuote.current = quote.id
    notifyResult(true, t('common.notifications.unwrapService.sent'))
  }, [quote?.id, quote?.status, notifyResult, t])

  if (!unwrapSendInfo || !chain || !assetConfig) return <Loading text={t('common.general.loading')} />

  const handleContinue = () => {
    if (!chain.isValidAddress(receiver)) {
      setError(t('errors.send.chain.invalidAddress', { chain: chain.name }))
      return
    }
    const destination = receiver.trim()
    setError('')
    setReceiver(destination)
    setUnwrapSendInfo({
      ...unwrapSendInfo,
      receiver: destination,
      amount,
      quote: destination === unwrapSendInfo.receiver ? quote : undefined,
    })
    setStep('amount')
  }

  const handleAmountChange = (value: bigint) => {
    setError('')
    setUnwrapSendInfo({ ...unwrapSendInfo, amount: value })
  }

  const handleSend = async () => {
    if (sendingRef.current || sending || depositStarted) return
    if (!svcWallet) return setError(t('errors.send.wallet.notReady'))
    if (!sender) return setError(t('errors.send.arkade.addressUnable'))
    if (!assetId) return setError(t('errors.general.missingAsset'))
    if (amount <= BigInt(0)) return setError(t('errors.general.missingAmount'))
    if (amount > availableBalance) return setError(t('errors.funds.insufficient'))
    if (awaitingQuote) return

    sendingRef.current = true
    const fundingId = crypto.randomUUID()
    setUnwrapSendInfo({ ...unwrapSendInfo, fundingId })
    // The request may finish after navigation. Update only its own flow, and
    // keep the in-flight marker in context so returning cannot submit it twice.
    const updateFunding = (updates: Partial<UnwrapSendInfo>) =>
      setUnwrapSendInfo((prev) => (prev?.fundingId === fundingId ? { ...prev, ...updates } : prev))
    setError('')
    try {
      // Refresh the quote reserved on the amount step. On retry, check whether the
      // previous deposit was already observed before allowing another send.
      let currentQuote = quote ? await getWrapQuote(quote.id) : undefined
      if (
        !currentQuote ||
        (!currentQuote.deposit_tx_hash &&
          (currentQuote.status === 'expired' ||
            (currentQuote.status === 'pending' && currentQuote.expiry <= Date.now())))
      ) {
        currentQuote = await createUnwrapQuote({
          chain: unwrapSendInfo.chainId,
          ticker: unwrapSendInfo.ticker,
          sender,
          receiver: unwrapSendInfo.receiver,
        })
      }
      const fundingQuote = currentQuote
      updateFunding({ quote: fundingQuote })
      if (fundingQuote.status !== 'pending' || fundingQuote.deposit_tx_hash) return
      if (fundingQuote.expiry <= Date.now()) throw new Error(t('common.notifications.unwrapService.expired'))
      const fundingMinAmount = minAmountOf(fundingQuote)
      if (amount < fundingMinAmount) {
        return setError(
          t('errors.send.unwrap.belowMinimum', {
            amount: prettyMinAmount(fundingMinAmount, precision),
            ticker: unwrapSendInfo.ticker,
          }),
        )
      }

      // The bridge derives the payout from the deposit, not an amount in the
      // quote request. Keep the wallet transfer in bigint base units throughout.
      const fundingTxid = await sendAssets(svcWallet, fundingQuote.treasury, [{ assetId, amount }])
      if (!fundingTxid) throw new Error(t('errors.send.general.errorSend'))
      updateFunding({ amount, txid: fundingTxid })
      saveTransactionActivityMetadata(fundingTxid, { destination: unwrapSendInfo.receiver })
    } catch (err) {
      consoleError(err, 'error sending unwrap deposit')
      setError(extractError(err))
      notifyResult(false, t('common.notifications.bank.failedTransaction'))
    } finally {
      sendingRef.current = false
      updateFunding({ fundingId: undefined })
    }
  }

  const handleBack = () => {
    if (step === 'amount' && !depositStarted) {
      setError('')
      setStep('address')
    } else {
      goBack()
    }
  }

  if (quote?.status === 'completed') {
    const payout = formatBaseUnits(quote.payout_amount, assetConfig.precision)
    return (
      <>
        <Header text={t('common.general.success')} />
        <Content>
          <Success
            headline={t('common.notifications.unwrapService.completedHeadline')}
            text={
              payout
                ? t('common.notifications.unwrapService.sendInfo', {
                    value: payout,
                    ticker: unwrapSendInfo.ticker,
                    name: chain.name,
                  })
                : t('common.notifications.unwrapService.sent')
            }
          />
        </Content>
        <ButtonsOnBottom>
          <Button label={t('common.general.done')} onClick={() => navigate(Pages.Wallet)} />
        </ButtonsOnBottom>
      </>
    )
  }

  const enteringAddress = step === 'address' && !depositStarted
  const insufficientFunds = amount > availableBalance
  const minAmount = minAmountOf(quote)
  const belowMinimum = amount > BigInt(0) && amount < minAmount

  return (
    <>
      <Header
        text={t('common.notifications.unwrapService.sendHeader', { ticker: unwrapSendInfo.ticker, name: chain.name })}
        back={sending ? false : handleBack}
      />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
            <ErrorMessage error={Boolean(error)} text={error} />
            {enteringAddress ? (
              <Input
                label={t('common.notifications.unwrapService.destination', { name: chain.name })}
                value={receiver}
                onChange={setReceiver}
                onEnter={handleContinue}
                placeholder={chain.addressPlaceholder}
              />
            ) : (
              <>
                {!depositStarted ? (
                  <>
                    <Text centered small color='neutral-500'>
                      {t('common.general.amount')}
                    </Text>
                    <InlineAmountInput
                      ariaLabel={t('common.general.amount')}
                      value={Number(amount)}
                      onChange={(value) => handleAmountChange(BigInt(value))}
                      onAssetAmountChange={handleAmountChange}
                      asset={assetConfig.symbol as AssetSymbol}
                      ticker={unwrapSendInfo.ticker}
                      precision={precision}
                      displayValue={centsToUnits(amount, precision)}
                      allowFiat={false}
                      disabled={sending}
                    />
                    <Text centered small color='neutral-500'>
                      {t('common.notifications.unwrapService.availableBalance', {
                        amount: prettyAssetAmount(availableBalance, precision),
                        ticker: unwrapSendInfo.ticker,
                      })}
                    </Text>
                    {availableBalance > BigInt(0) ? (
                      <FlexRow centered gap='0.7rem'>
                        {[25, 50, 75, 100].map((percent) => (
                          <button
                            key={percent}
                            type='button'
                            disabled={sending}
                            onClick={() => handleAmountChange((availableBalance * BigInt(percent)) / BigInt(100))}
                            style={{
                              background: 'var(--surface)',
                              border: '1px solid var(--neutral-100)',
                              borderRadius: '0.5rem',
                              color: 'var(--neutral-700)',
                              cursor: sending ? 'default' : 'pointer',
                              fontSize: '0.875rem',
                              fontWeight: 500,
                              padding: '0.5rem 1rem',
                            }}
                          >
                            {percent}%
                          </button>
                        ))}
                      </FlexRow>
                    ) : null}
                  </>
                ) : (
                  <Text centered bold>
                    {prettyAssetAmount(amount, precision)} {unwrapSendInfo.ticker}
                  </Text>
                )}
                <FlexCol gap='0.25rem'>
                  <Text small color='neutral-500'>
                    {t('common.notifications.unwrapService.destination', { name: chain.name })}
                  </Text>
                  <Text small wrap>
                    {unwrapSendInfo.receiver}
                  </Text>
                </FlexCol>
                <InfoContainer>
                  {depositStarted && quote ? (
                    <InfoLine
                      compact
                      text={t(
                        quote.status === 'pending'
                          ? 'common.notifications.unwrapService.confirming'
                          : statusLabel(quote.status),
                      )}
                    />
                  ) : (
                    <InfoLine compact text={t('common.notifications.send.feesDeduction')} />
                  )}
                  {!depositStarted && minAmount > BigInt(0) ? (
                    <InfoLine
                      compact
                      text={t('common.notifications.unwrapService.minAmount', {
                        amount: prettyMinAmount(minAmount, precision),
                        ticker: unwrapSendInfo.ticker,
                      })}
                    />
                  ) : null}
                  <InfoLine
                    compact
                    text={t('common.notifications.wrapService.feeRate', { rate: SERVICE_FEE_PERCENT })}
                  />
                  {quote?.network_fee_amount ? (
                    <InfoLine
                      compact
                      text={t('common.notifications.unwrapService.networkFee', {
                        amount: formatBaseUnits(quote.network_fee_amount, assetConfig.precision),
                        ticker: unwrapSendInfo.ticker,
                      })}
                    />
                  ) : null}
                  {quote?.fee_amount ? (
                    <InfoLine
                      compact
                      text={t('common.notifications.wrapService.bridgeFee', {
                        amount: formatBaseUnits(quote.fee_amount, assetConfig.precision),
                        ticker: unwrapSendInfo.ticker,
                      })}
                    />
                  ) : null}
                  {quote?.payout_amount ? (
                    <InfoLine
                      compact
                      text={t('common.notifications.unwrapService.payout', {
                        amount: formatBaseUnits(quote.payout_amount, assetConfig.precision),
                        ticker: unwrapSendInfo.ticker,
                      })}
                    />
                  ) : null}
                </InfoContainer>
              </>
            )}
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        {enteringAddress ? (
          <Button label={t('common.general.continue')} onClick={handleContinue} disabled={!receiver.trim()} />
        ) : depositStarted ? (
          <Button label={t('common.general.done')} onClick={() => navigate(Pages.Wallet)} secondary />
        ) : (
          <Button
            label={t(
              sending
                ? 'common.general.sendAsset'
                : insufficientFunds
                  ? 'errors.funds.insufficient'
                  : belowMinimum
                    ? 'common.notifications.unwrapService.belowMinimum'
                    : 'common.confirmSend',
            )}
            onClick={handleSend}
            disabled={
              sending ||
              awaitingQuote ||
              !svcWallet ||
              !sender ||
              !assetId ||
              amount <= BigInt(0) ||
              insufficientFunds ||
              belowMinimum
            }
          />
        )}
      </ButtonsOnBottom>
    </>
  )
}
