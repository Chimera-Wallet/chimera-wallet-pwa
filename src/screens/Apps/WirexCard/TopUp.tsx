// Top up the card from the Chimera wallet: Ark USDT -> Arkade Wrap -> USDT on
// Base at the Wirex wallet -> WUSD card balance. See ./topUp.ts for the flow.
// (MoveAssets.tsx handles moves within Wirex: wallet tokens <-> card.)

import { useContext, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Header from '../../../components/Header'
import Content from '../../../components/Content'
import Padded from '../../../components/Padded'
import FlexCol from '../../../components/FlexCol'
import FlexRow from '../../../components/FlexRow'
import Text from '../../../components/Text'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import ErrorMessage from '../../../components/Error'
import InlineAmountInput from '../../../components/InlineAmountInput'
import InfoContainer from '../../../components/InfoContainer'
import { InfoLine } from '../../../components/Info'
import Loading from '../../../components/Loading'
import Success from '../../../components/Success'
import { NavigationContext } from '../../../providers/navigation'
import { WalletContext } from '../../../providers/wallet'
import { getReceivingAddresses } from '../../../lib/asp'
import {
  BALANCE_DISPLAY_DECIMALS,
  centsToUnits,
  getWrappedAssetId,
  prettyAssetAmount,
  requireAssetConfig,
} from '../../../lib/assets'
import { SERVICE_FEE_PERCENT, type WrapQuote } from '../../../lib/arkadeWrap'
import { getWirexDepositChain } from '../../../lib/sourceChains'
import { getWirexWallet } from '../../../lib/wirex'
import { saveTransactionActivityMetadata } from '../../../lib/storage'
import { consoleError } from '../../../lib/logs'
import { errorText, getWirexCardBalance } from './lib'
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
} from './topUp'

export interface TopUpNavData {
  userAddress: string
  cardId: string
}

const PERCENTAGES = [25, 50, 75, 100]

export const baseTxUrl = (hash: string) =>
  `${import.meta.env.VITE_WIREX_SDK_ENV === 'prod' ? 'https://basescan.org' : 'https://sepolia.basescan.org'}/tx/${hash}`

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

  const header = <Header text={t('apps.wirexCard.topUpFlow.title')} back={sending || topUp ? false : goBack} />

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
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
            <ErrorMessage error={Boolean(error)} text={error} />
            <Text centered small color='neutral-500'>
              {t('apps.wirexCard.topUpFlow.from')}
            </Text>
            <InlineAmountInput
              ariaLabel={t('apps.wirexCard.amount')}
              value={Number(amount)}
              onChange={(value) => setAmount(BigInt(value))}
              onAssetAmountChange={setAmount}
              asset={source.symbol}
              ticker={source.symbol}
              precision={precision}
              displayValue={centsToUnits(amount, precision)}
              allowFiat={false}
              disabled={sending}
            />
            <Text centered small color='neutral-500'>
              {t('common.notifications.unwrapService.availableBalance', {
                amount: prettyAssetAmount(available, precision),
                ticker: source.symbol,
              })}
            </Text>
            {available > BigInt(0) ? (
              <FlexRow centered gap='0.7rem'>
                {PERCENTAGES.map((percent) => (
                  <button
                    key={percent}
                    type='button'
                    data-testid={`wirex-topup-pct-${percent}`}
                    disabled={sending}
                    onClick={() => setAmount((available * BigInt(percent)) / BigInt(100))}
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
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button
          label={t('apps.wirexCard.confirm')}
          onClick={confirm}
          disabled={!canConfirm}
          loading={sending}
          testId='wirex-topup-confirm'
        />
      </ButtonsOnBottom>
    </>
  )
}
