import { useContext, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BTC_ASSET_ID, findMarket, makeCachedFeedFetch, QUOTE_OPTIONS, validatePlan } from '@arkade-os/swap'
import { useOfferQuote } from '@arkade-os/solver-discovery/react'
import Header from '../../../components/Header'
import Content from '../../../components/Content'
import Padded from '../../../components/Padded'
import FlexCol from '../../../components/FlexCol'
import FlexRow from '../../../components/FlexRow'
import Text, { TextLabel, TextSecondary } from '../../../components/Text'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import Shadow from '../../../components/Shadow'
import Loading from '../../../components/Loading'
import CenterScreen from '../../../components/CenterScreen'
import ErrorMessage from '../../../components/Error'
import SheetModal from '../../../components/SheetModal'
import Table, { type TableData } from '../../../components/Table'
import Success from '../../../components/Success'
import AssetSelector from '../../../components/AssetSelector'
import CurrencySwapIcon from '../../../icons/CurrencySwap'
import { SwapSuccessIcon } from '../../../icons/Swap'
import { AssetSwapsContext } from '../../../providers/assetSwaps'
import { AspContext } from '../../../providers/asp'
import { WalletContext } from '../../../providers/wallet'
import { FlowContext } from '../../../providers/flow'
import { FiatContext } from '../../../providers/fiat'
import { ConfigContext } from '../../../providers/config'
import {
  ASSET_LIST,
  centsToUnits,
  getAssetSymbolByAssetId,
  getDisplayTicker,
  getWrappedAssetId,
  prettyAssetNumber,
  unitsToCents,
  type AssetConfig,
  type AssetSymbol,
} from '../../../lib/assets'
import { preFeeDisplayRate } from '../../../lib/swapMarkets'
import { type AssetSwapQuoteSnapshot } from '../../../lib/swapRepository'
import { extractError } from '../../../lib/error'
import { hapticLight, hapticTap } from '../../../lib/haptics'
import { toast } from '../../../components/Toast'

interface SwapFormProps {
  onBack: () => void
}

/** A swappable asset, resolved to the identifiers the solver/market APIs use. */
interface ResolvedAsset {
  symbol: AssetSymbol
  assetId: string
  ticker: string
  decimals: number
  balanceAtomic: bigint
}

type DrawerState = 'review' | null

interface CompletedSwap {
  toAmount: string
  toTicker: string
}

const DEBOUNCE_MS = 600

const assetIdForSymbol = (symbol: AssetSymbol): string | undefined =>
  symbol === 'BTC' ? BTC_ASSET_ID : getWrappedAssetId(symbol)

export default function AssetSwapForm({ onBack }: SwapFormProps) {
  const { t } = useTranslation()
  const { aspInfo } = useContext(AspContext)
  const { markets, swapAvailable, createSwap } = useContext(AssetSwapsContext)
  const { balance, assetBalances } = useContext(WalletContext)
  const { assetSwapFromAssetId, setAssetSwapFromAssetId } = useContext(FlowContext)
  const { toFiat } = useContext(FiatContext)
  const { config } = useContext(ConfigContext)

  // The assets this wallet actually knows how to swap: every enabled,
  // non-comingSoon asset that the solver registry has a market for. BTC is
  // always eligible as a counterparty; a wrapped asset needs its Arkade id
  // configured and a market advertising it.
  const swappableAssets = useMemo<AssetConfig[]>(() => {
    return ASSET_LIST.filter((cfg) => {
      if (cfg.comingSoon) return false
      const assetId = assetIdForSymbol(cfg.symbol as AssetSymbol)
      if (!assetId) return false
      if (assetId === BTC_ASSET_ID) return true
      return markets.some((market) => market.base_asset.id === assetId || market.quote_asset.id === assetId)
    })
  }, [markets])

  // The wallet's own precision table (ASSET_LIST) is a display default, not
  // a source of truth for a market's actual token — a market's base/quote
  // asset carries its real on-chain decimals, which can differ (e.g. a
  // testnet market quoting a token at fewer decimals than production). Prefer
  // that when a market names this asset, so amounts convert to atomic units
  // correctly regardless of what the static config assumes.
  const marketDecimalsForAsset = (assetId: string): number | undefined => {
    for (const market of markets) {
      if (market.base_asset.id === assetId) return market.base_asset.decimals
      if (market.quote_asset.id === assetId) return market.quote_asset.decimals
    }
    return undefined
  }

  const resolveAsset = (symbol: AssetSymbol | undefined): ResolvedAsset | undefined => {
    if (!symbol) return undefined
    const cfg = swappableAssets.find((asset) => asset.symbol === symbol)
    const assetId = assetIdForSymbol(symbol)
    if (!cfg || !assetId) return undefined
    const balanceAtomic =
      assetId === BTC_ASSET_ID
        ? BigInt(Math.max(0, Math.floor(balance)))
        : (assetBalances.find((entry) => entry.assetId === assetId)?.amount ?? BigInt(0))
    return {
      symbol,
      assetId,
      ticker: getDisplayTicker(symbol),
      decimals: assetId === BTC_ASSET_ID ? 8 : (marketDecimalsForAsset(assetId) ?? cfg.precision),
      balanceAtomic,
    }
  }

  const [fromSymbol, setFromSymbol] = useState<AssetSymbol | undefined>()
  const [toSymbol, setToSymbol] = useState<AssetSymbol | undefined>()
  const [amount, setAmount] = useState('')
  const [drawer, setDrawer] = useState<DrawerState>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const [completed, setCompleted] = useState<CompletedSwap | undefined>()

  const fromAsset = resolveAsset(fromSymbol)

  // Assets the current "from" side can actually swap into, via a real market.
  const toOptions = useMemo<AssetConfig[]>(() => {
    if (!fromAsset) return []
    return swappableAssets.filter((cfg) => {
      if (cfg.symbol === fromAsset.symbol) return false
      const candidateId = assetIdForSymbol(cfg.symbol as AssetSymbol)
      return Boolean(candidateId && findMarket(markets, fromAsset.assetId, candidateId)?.market)
    })
  }, [fromAsset, swappableAssets, markets])

  const toAsset = resolveAsset(toSymbol)

  // Default (and re-default, if the current pick drops out of the list) the
  // "from" asset once the swappable universe is known.
  useEffect(() => {
    if (swappableAssets.length === 0) return
    if (fromSymbol && swappableAssets.some((asset) => asset.symbol === fromSymbol)) return
    setFromSymbol(swappableAssets[0].symbol as AssetSymbol)
  }, [swappableAssets, fromSymbol])

  // Default (and re-default) the "to" asset once a "from" side and its
  // markets are known — AssetSelector always needs a selected value.
  useEffect(() => {
    if (toOptions.length === 0) {
      if (toSymbol) setToSymbol(undefined)
      return
    }
    if (toSymbol && toOptions.some((asset) => asset.symbol === toSymbol)) return
    setToSymbol(toOptions[0].symbol as AssetSymbol)
  }, [toOptions, toSymbol])


  useEffect(() => {
    if (!assetSwapFromAssetId || swappableAssets.length === 0) return
    const symbol =
      assetSwapFromAssetId === BTC_ASSET_ID ? 'BTC' : getAssetSymbolByAssetId(assetSwapFromAssetId)
    if (symbol && swappableAssets.some((asset) => asset.symbol === symbol)) {
      setFromSymbol(symbol)
    }
    setAssetSwapFromAssetId(undefined)
  }, [assetSwapFromAssetId, swappableAssets])

  const pair = fromAsset && toAsset ? findMarket(markets, fromAsset.assetId, toAsset.assetId) : undefined
  const feedFetch = useMemo(() => makeCachedFeedFetch(), [])
  const { plan, setGiveAmount, solvable, status } = useOfferQuote(pair?.market ?? null, {
    give: pair?.give,
    fetchImpl: feedFetch,
    ...QUOTE_OPTIONS,
  })

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setGiveAmount(Number(amount) > 0 ? amount : '')
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [amount, setGiveAmount])

  const planMatchesAmount = Boolean(plan && plan.deposit.display === (amount || '0'))
  const currentPlan = status === 'success' && planMatchesAmount ? plan : null
  const hasPositiveAmount = Number(amount) > 0
  const quoteLoading = status === 'loading' || (Boolean(toAsset) && hasPositiveAmount && !currentPlan && status !== 'error')

  const balanceAtomic = fromAsset?.balanceAtomic ?? BigInt(0)
  const exceedsBalance = Boolean(fromAsset && hasPositiveAmount && unitsToCents(amount, fromAsset.decimals) > balanceAtomic)
  const planError = currentPlan ? validatePlan(currentPlan, balanceAtomic, aspInfo.dust) : undefined

  const validationMessage = (): string | undefined => {
    if (!toAsset || !hasPositiveAmount) return undefined
    if (exceedsBalance) return t('apps.swap.insufficientBalance')
    if (!pair?.market) return t('apps.swap.noMarket')
    if (quoteLoading) return undefined
    if (planError === 'below-min') return t('apps.swap.belowMin')
    if (planError === 'above-max') return t('apps.swap.aboveMax')
    if (planError === 'below-dust') return t('apps.swap.belowDust')
    if (planError) return t('apps.swap.quoteUnavailable')
    if (solvable === false) return t('apps.swap.quoteUnavailable')
    if (status === 'error') return t('apps.swap.quoteUnavailable')
    return undefined
  }
  const validation = validationMessage()

  useEffect(() => {
    if (!validation) {
      toast.dismiss('asset-swap-validation')
      return
    }
    toast.error(validation, { id: 'asset-swap-validation' })
  }, [validation])

  useEffect(() => {
    return () => {
      toast.dismiss('asset-swap-validation')
    }
  }, [])

  const canContinue = Boolean(toAsset && currentPlan && !planError && !exceedsBalance)

  const changeAmount = (value: string) => {
    if (!fromAsset) return
    if (value !== '' && !/^\d*\.?\d*$/.test(value)) return
    const [, fraction = ''] = value.split('.')
    if (fraction.length > fromAsset.decimals) return
    setConfirmError('')
    setAmount(value)
  }

  const useMaxBalance = () => {
    if (!fromAsset || balanceAtomic <= BigInt(0)) return
    hapticLight()
    setConfirmError('')
    setAmount(centsToUnits(balanceAtomic, fromAsset.decimals))
  }

  const selectFromSymbol = (symbol: AssetSymbol) => {
    hapticLight()
    if (symbol === toSymbol) setToSymbol(undefined)
    setFromSymbol(symbol)
    setAmount('')
  }

  const selectToSymbol = (symbol: AssetSymbol) => {
    hapticLight()
    setToSymbol(symbol)
    setAmount('')
  }

  const flipAssets = () => {
    if (!fromAsset || !toAsset) return
    hapticLight()
    setFromSymbol(toAsset.symbol)
    setToSymbol(fromAsset.symbol)
    setAmount('')
  }

  const openReview = () => {
    if (!canContinue) return
    hapticTap()
    setConfirmError('')
    setDrawer('review')
  }

  const confirmSwap = async () => {
    if (!currentPlan || !fromAsset || !toAsset || confirming || !canContinue) return
    setConfirmError('')
    setConfirming(true)
    try {
      const quoteSnapshot: AssetSwapQuoteSnapshot = {
        fromTicker: fromAsset.ticker,
        fromDecimals: fromAsset.decimals,
        toTicker: toAsset.ticker,
        toDecimals: toAsset.decimals,
        feeBps: currentPlan.market.fee_bps,
        ...(fromAsset.assetId === BTC_ASSET_ID
          ? { fiatCurrency: config.fiat, fromFiatAmount: toFiat(Number(currentPlan.deposit.atomic)) }
          : {}),
      }
      await createSwap(currentPlan, quoteSnapshot)
      hapticLight()
      setDrawer(null)
      setCompleted({
        toAmount: prettyAssetNumber(currentPlan.receive.display, toAsset.decimals),
        toTicker: toAsset.ticker,
      })
    } catch (error) {
      setConfirmError(extractError(error))
    } finally {
      setConfirming(false)
    }
  }

  const handleDone = () => {
    setCompleted(undefined)
    setAmount('')
    onBack()
  }

  if (!swapAvailable) {
    return (
      <>
        <Header text={t('apps.swap.swap')} back={onBack} />
        <Content>
          <Padded>
            <CenterScreen>
              <Text heading>{t('apps.swap.unavailable')}</Text>
              <TextSecondary centered>{t('apps.swap.unavailableText')}</TextSecondary>
            </CenterScreen>
          </Padded>
        </Content>
      </>
    )
  }

  if (swappableAssets.length === 0 || !fromAsset) {
    return (
      <>
        <Header text={t('apps.swap.swap')} back={onBack} />
        <Content>
          <Loading text={t('apps.swap.loadAss')} />
        </Content>
      </>
    )
  }

  if (completed) {
    return (
      <>
        <Header text={t('common.general.success')} />
        <Content>
          <Success
            icon={<SwapSuccessIcon />}
            headline={t('apps.swap.swapCompleted')}
            text={t('apps.swap.swapCompletedText', { amount: completed.toAmount, ticker: completed.toTicker })}
          />
        </Content>
        <ButtonsOnBottom>
          <Button label={t('common.general.done')} onClick={handleDone} />
        </ButtonsOnBottom>
      </>
    )
  }

  const reviewData: TableData = currentPlan
    ? [
        [
          t('common.general.from'),
          `${prettyAssetNumber(currentPlan.deposit.display, fromAsset.decimals)} ${fromAsset.ticker}`,
        ],
        [
          t('common.general.to'),
          `${prettyAssetNumber(currentPlan.receive.display, toAsset?.decimals ?? 0)} ${toAsset?.ticker ?? ''}`,
        ],
        [
          t('apps.swap.rate'),
          toAsset ? `1 ${fromAsset.ticker} ≈ ${prettyAssetNumber(preFeeDisplayRate(currentPlan), toAsset.decimals)} ${toAsset.ticker}` : '',
        ],
        [t('apps.swap.fee'), `${(currentPlan.market.fee_bps / 100).toFixed(2)}%`],
      ]
    : []

  return (
    <>
      <Header text={t('apps.swap.swap')} back={onBack} />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
            <ErrorMessage error={Boolean(confirmError)} text={confirmError} />

            <FlexCol gap='0.25rem'>
              <AssetSelector
                assets={swappableAssets}
                label={t('apps.swap.selectFrom')}
                selected={fromAsset.symbol}
                onSelect={selectFromSymbol}
                showValue
              />
              <TextSecondary>
                {prettyAssetNumber(centsToUnits(fromAsset.balanceAtomic, fromAsset.decimals), fromAsset.decimals)}{' '}
                {fromAsset.ticker} {t('apps.swap.available')}
              </TextSecondary>
            </FlexCol>

            <FlexRow centered>
              <FlipAssetsButton onClick={flipAssets} disabled={!toAsset} />
            </FlexRow>

            {toOptions.length > 0 && toAsset ? (
              <AssetSelector
                assets={toOptions}
                label={t('apps.swap.selectTo')}
                selected={toAsset.symbol}
                onSelect={selectToSymbol}
                showValue
              />
            ) : (
              <FlexCol gap='0.5rem'>
                <TextLabel>{t('apps.swap.selectTo')}</TextLabel>
                <Shadow fat>
                  <TextSecondary>{t('apps.swap.noMarket')}</TextSecondary>
                </Shadow>
              </FlexCol>
            )}

            <FlexCol gap='0.5rem'>
              <TextLabel>
                {t('common.general.amount')} ({fromAsset.ticker})
              </TextLabel>
              <Shadow fat>
                <FlexRow between>
                  <input
                    type='text'
                    inputMode='decimal'
                    placeholder='0'
                    value={amount}
                    onChange={(ev) => changeAmount(ev.target.value)}
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
                  <p
                    role='button'
                    onClick={useMaxBalance}
                    data-testid='asset-swap-max'
                    style={{ color: 'var(--purpletext)', cursor: 'pointer', fontWeight: 600 }}
                  >
                    {t('apps.swap.max')}
                  </p>
                </FlexRow>
              </Shadow>
              {fromAsset.assetId === BTC_ASSET_ID && hasPositiveAmount ? (
                <TextSecondary>
                  {prettyAssetNumber(toFiat(Number(unitsToCents(amount, 8))), 2)} {config.fiat}
                </TextSecondary>
              ) : null}
            </FlexCol>

            {currentPlan && toAsset ? (
              <Shadow lighter>
                <FlexCol gap='0.5rem' padding='0.75rem'>
                  <FlexRow between>
                    <TextSecondary>{t('apps.swap.rate')}</TextSecondary>
                    <Text bold>
                      1 {fromAsset.ticker} ≈ {prettyAssetNumber(preFeeDisplayRate(currentPlan), toAsset.decimals)} {toAsset.ticker}
                    </Text>
                  </FlexRow>
                  <FlexRow between>
                    <TextSecondary>{t('apps.swap.fee')}</TextSecondary>
                    <Text bold>{(currentPlan.market.fee_bps / 100).toFixed(2)}%</Text>
                  </FlexRow>
                </FlexCol>
              </Shadow>
            ) : null}

            <Button
              onClick={openReview}
              label={quoteLoading ? t('common.general.loading') : t('apps.swap.reviewSwap')}
              disabled={!canContinue || quoteLoading}
            />
          </FlexCol>
        </Padded>
      </Content>

      <SheetModal isOpen={drawer === 'review'} onClose={() => setDrawer(null)}>
        <FlexCol gap='1rem'>
          <Text bold large>
            {t('apps.swap.reviewSwap')}
          </Text>
          <Table data={reviewData} />
          <ErrorMessage error={Boolean(confirmError)} text={confirmError} />
          <Button
            onClick={confirmSwap}
            label={confirming ? t('apps.swap.confirming') : t('apps.swap.confirmSwap')}
            disabled={confirming}
            loading={confirming}
          />
        </FlexCol>
      </SheetModal>
    </>
  )
}

function FlipAssetsButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type='button'
      onClick={disabled ? undefined : onClick}
      aria-label='Flip assets'
      disabled={disabled}
      style={{
        background: 'var(--dark10)',
        border: 'none',
        borderRadius: '50%',
        width: '36px',
        height: '36px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        color: 'var(--white)',
      }}
    >
      <CurrencySwapIcon />
    </button>
  )
}
