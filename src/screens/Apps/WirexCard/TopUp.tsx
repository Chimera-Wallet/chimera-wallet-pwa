import { useContext, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Header from '../../../components/Header'
import Content from '../../../components/Content'
import Padded from '../../../components/Padded'
import FlexCol from '../../../components/FlexCol'
import Text from '../../../components/Text'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import ErrorMessage from '../../../components/Error'
import InfoContainer from '../../../components/InfoContainer'
import { InfoLine } from '../../../components/Info'
import Loading from '../../../components/Loading'
import Success from '../../../components/Success'
import { NavigationContext } from '../../../providers/navigation'
import { WalletContext } from '../../../providers/wallet'
import { getReceivingAddresses } from '../../../lib/asp'
import { formatUnits, parseUnits } from 'viem'
import AssetIcon from '../../../icons/AssetIcon'
import { BALANCE_DISPLAY_DECIMALS, getWrappedAssetId, prettyAssetAmount, requireAssetConfig } from '../../../lib/assets'
import { SERVICE_FEE_PERCENT, type WrapQuote } from '../../../lib/arkadeWrap'
import { getWirexDepositChain } from '../../../lib/sourceChains'
import { getWirexWallet } from '../../../lib/wirex'
import { saveTransactionActivityMetadata } from '../../../lib/storage'
import { consoleError } from '../../../lib/logs'
import { prettyNumber } from '../../../lib/format'
import { CARD_CURRENCY, CARD_DECIMALS, baseTxUrl, errorText, getWirexCardBalance } from '../../../lib/wirexCard'
import {
  CardRowIcon,
  ConfirmTransferButton,
  PercentChips,
  TransferAmount,
  TransferLayout,
  TransferRow,
  TransferRows,
  type TopUpNavData,
} from './shared'
import {
  TOP_UP_SOURCES,
  TopUpBelowMinimumError,
  createTopUpQuote,
  estimateTopUpPayout,
  fundWirexTopUp,
  minAmountOf,
  savePendingTopUp,
  trackWirexTopUp,
  type PendingTopUp,
} from '../../../lib/wirexTopUp'

// Round the minimum up to what the balance display can show.
const prettyMinAmount = (minAmount: bigint, precision: number): string => {
  const step = BigInt(10) ** BigInt(Math.max(0, precision - BALANCE_DISPLAY_DECIMALS))
  return prettyAssetAmount(((minAmount + step - BigInt(1)) / step) * step, precision)
}

export default function WirexTopUp() {
  const { t } = useTranslation()
  const { goBack, navigationData } = useContext(NavigationContext)
  const { assetBalances, assetMetadataCache, svcWallet } = useContext(WalletContext)

  const nav = navigationData as Partial<TopUpNavData> | undefined
  const userAddress = nav?.userAddress ?? ''

  // v1 has a single source; the registry leaves room for more.
  const source = TOP_UP_SOURCES[0]
  const assetConfig = requireAssetConfig(source.symbol)
  const assetId = getWrappedAssetId(source.symbol)
  const precision = (assetId ? assetMetadataCache.get(assetId)?.metadata?.decimals : undefined) ?? assetConfig.precision
  const available = assetBalances.find((a) => a.assetId === assetId)?.amount ?? BigInt(0)
  const chainName = getWirexDepositChain().name

  const [sender, setSender] = useState('')
  const [receiver, setReceiver] = useState('')
  const [baselineWusd, setBaselineWusd] = useState(0)
  const [quote, setQuote] = useState<WrapQuote>()
  const [amount, setAmount] = useState(BigInt(0))
  // What the user typed (decimal units); `amount` is the same in base units.
  const [amountText, setAmountText] = useState('')
  const [sending, setSending] = useState(false)
  const [topUp, setTopUp] = useState<PendingTopUp>()
  const [error, setError] = useState('')
  const sendingRef = useRef(false)
  const trackAbort = useRef<AbortController>()

  useEffect(() => () => trackAbort.current?.abort(), [])

  // Wirex wallet (payout receiver + WUSD baseline) and our Ark address.
  useEffect(() => {
    if (!svcWallet || !userAddress) return
    let active = true
    Promise.all([getWirexWallet(userAddress), getReceivingAddresses(svcWallet)])
      .then(([wallet, { offchainAddr }]) => {
        if (!active) return
        if (!wallet?.wallet_address) throw new Error(t('apps.wirexCard.topUpFlow.noWallet'))
        if (wallet.wallet_status === 'Rejected') throw new Error(t('apps.wirexCard.topUpFlow.noWallet'))
        setReceiver(wallet.wallet_address)
        setBaselineWusd(getWirexCardBalance(wallet))
        setSender(offchainAddr)
      })
      .catch((err) => active && setError(errorText(err)))
    return () => {
      active = false
    }
  }, [svcWallet, userAddress, t])

  // Reserve a quote up front: the minimum and network fee only come with one.
  useEffect(() => {
    if (!sender || !receiver) return
    let active = true
    createTopUpQuote(sender, receiver)
      .then((q) => active && setQuote(q))
      .catch((err) => {
        consoleError(err, 'error creating top-up quote')
        if (active) setError(errorText(err))
      })
    return () => {
      active = false
    }
  }, [sender, receiver])

  const track = (start: PendingTopUp) => {
    trackAbort.current?.abort()
    const controller = new AbortController()
    trackAbort.current = controller
    trackWirexTopUp(start, { signal: controller.signal, onUpdate: setTopUp }).catch((err) => {
      if (err?.name !== 'AbortError') setError(errorText(err))
    })
  }

  const confirm = async () => {
    if (sendingRef.current || !svcWallet || !sender || !receiver) return
    sendingRef.current = true
    setSending(true)
    setError('')
    try {
      const result = await fundWirexTopUp({
        wallet: svcWallet,
        sender,
        receiver,
        symbol: source.symbol,
        amount,
        quote,
      })
      setQuote(result.quote)
      const pending: PendingTopUp = {
        quoteId: result.quote.id,
        txid: result.txid ?? result.quote.deposit_tx_hash ?? '',
        userAddress,
        symbol: source.symbol,
        amount: amount.toString(),
        baselineWusd,
        createdAt: Date.now(),
        phase: 'bridging',
      }
      if (result.txid) saveTransactionActivityMetadata(result.txid, { destination: receiver })
      savePendingTopUp(pending)
      setTopUp(pending)
      track(pending)
    } catch (err) {
      consoleError(err, 'error funding card top-up')
      setError(
        err instanceof TopUpBelowMinimumError
          ? t('apps.wirexCard.topUpFlow.belowMinimum', {
              amount: prettyMinAmount(err.minAmount, precision),
              ticker: source.symbol,
            })
          : errorText(err),
      )
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  // Native decimal keyboard: ',' accepted as the separator, at most `precision` places.
  const changeAmount = (raw: string) => {
    const next = raw.replace(',', '.')
    if (!new RegExp(`^\\d*\\.?\\d{0,${precision}}$`).test(next)) return
    const text = next === '.' ? '0.' : next
    setError('')
    setAmountText(text)
    setAmount(text && text !== '0.' ? parseUnits(text.replace(/\.$/, ''), precision) : BigInt(0))
  }

  const setPercent = (percent: number) => {
    const value = (available * BigInt(percent)) / BigInt(100)
    setError('')
    setAmount(value)
    setAmountText(value > BigInt(0) ? formatUnits(value, precision) : '')
  }

  const header = <Header text={t('apps.wirexCard.topUpFlow.title')} logo back={sending || topUp ? false : goBack} />

  if (topUp?.phase === 'credited') {
    return (
      <>
        <Header text={t('apps.wirexCard.topUpFlow.title')} />
        <Content>
          <Success
            headline={t('apps.wirexCard.topUpFlow.done')}
            text={t('apps.wirexCard.topUpFlow.doneInfo', {
              amount: prettyAssetAmount(BigInt(topUp.amount), precision),
              ticker: source.symbol,
            })}
          />
        </Content>
        <ButtonsOnBottom>
          <Button label={t('common.general.done')} onClick={goBack} />
        </ButtonsOnBottom>
      </>
    )
  }

  if (topUp) {
    const statusKey =
      topUp.phase === 'bridging'
        ? 'bridging'
        : topUp.phase === 'crediting'
          ? 'crediting'
          : topUp.phase === 'failed'
            ? 'failed'
            : 'stillProcessing'
    return (
      <>
        {header}
        <Content>
          <Padded>
            <FlexCol gap='1.5rem'>
              {topUp.phase === 'bridging' || topUp.phase === 'crediting' ? <Loading /> : null}
              <Text centered bold>
                {prettyAssetAmount(BigInt(topUp.amount), precision)} {source.symbol}
              </Text>
              <Text centered wrap testId='wirex-topup-status'>
                {t(`apps.wirexCard.topUpFlow.${statusKey}`, { name: chainName })}
              </Text>
              <ErrorMessage error={Boolean(error)} text={error} />
              <InfoContainer>
                <InfoLine compact text={t('apps.wirexCard.topUpFlow.reference', { id: topUp.quoteId })} />
                {topUp.payoutTxHash ? (
                  <a href={baseTxUrl(topUp.payoutTxHash)} target='_blank' rel='noopener noreferrer'>
                    <Text small>{t('apps.wirexCard.topUpFlow.viewPayout')}</Text>
                  </a>
                ) : null}
              </InfoContainer>
            </FlexCol>
          </Padded>
        </Content>
        <ButtonsOnBottom>
          <Button label={t('common.general.done')} onClick={goBack} />
        </ButtonsOnBottom>
      </>
    )
  }

  if (!userAddress) return <Loading text={t('common.general.loading')} />

  const minAmount = minAmountOf(quote)
  const insufficient = amount > available
  const belowMinimum = amount > BigInt(0) && amount < minAmount
  const payout = estimateTopUpPayout(amount, quote, SERVICE_FEE_PERCENT)
  const canConfirm =
    !sending && Boolean(quote && sender && receiver) && amount > BigInt(0) && !insufficient && !belowMinimum

  return (
    <>
      {header}
      <TransferLayout
        notes={
          <>
            <ErrorMessage error={Boolean(error)} text={error} />
            {insufficient ? <ErrorMessage error text={t('apps.wirexCard.insufficient')} /> : null}
            <InfoContainer>
              {!quote && !error ? <InfoLine compact text={t('common.general.loading')} /> : null}
              {minAmount > BigInt(0) ? (
                <InfoLine
                  compact
                  text={t('common.notifications.unwrapService.minAmount', {
                    amount: prettyMinAmount(minAmount, precision),
                    ticker: source.symbol,
                  })}
                />
              ) : null}
              <InfoLine compact text={t('common.notifications.wrapService.feeRate', { rate: SERVICE_FEE_PERCENT })} />
              {quote?.network_fee_amount ? (
                <InfoLine
                  compact
                  text={t('common.notifications.unwrapService.networkFee', {
                    amount: prettyAssetAmount(BigInt(quote.network_fee_amount), precision),
                    ticker: source.symbol,
                  })}
                />
              ) : null}
              <InfoLine
                compact
                text={t('apps.wirexCard.topUpFlow.youReceive', {
                  amount: prettyAssetAmount(payout, precision),
                })}
              />
            </InfoContainer>
          </>
        }
        footer={
          <>
            <ConfirmTransferButton
              testId='wirex-topup-confirm'
              label={t('apps.wirexCard.transfer.confirm')}
              onClick={confirm}
              disabled={!canConfirm}
              loading={sending}
            />
            <PercentChips
              testIdPrefix='wirex-topup-pct'
              onSelect={setPercent}
              disabled={sending || available === BigInt(0)}
            />
          </>
        }
      >
        <TransferAmount
          testId='wirex-topup-amount'
          ariaLabel={t('apps.wirexCard.amount')}
          value={amountText}
          onChange={changeAmount}
          unit={source.symbol}
          // The card is credited in WUSD, ~1:1 with what reaches the Wirex wallet.
          hint={`≈ ${prettyAssetAmount(payout, precision)} ${CARD_CURRENCY}`}
          disabled={sending}
        />
        <TransferRows
          from={
            <TransferRow
              testId='wirex-topup-from'
              icon={<AssetIcon symbol={source.symbol} size={40} />}
              label={t('apps.wirexCard.transfer.from', { name: t('apps.wirexCard.transfer.wallet') })}
              title={`${assetConfig.name} ${prettyAssetAmount(available, precision)} ${source.symbol}`}
            />
          }
          to={
            <TransferRow
              testId='wirex-topup-to'
              icon={<CardRowIcon />}
              label={t('apps.wirexCard.transfer.to', { name: t('apps.wirexCard.card') })}
              title={`${t('apps.wirexCard.card')} ${prettyNumber(baselineWusd, CARD_DECIMALS, true, CARD_DECIMALS)} ${CARD_CURRENCY}`}
            />
          }
        />
      </TransferLayout>
    </>
  )
}
