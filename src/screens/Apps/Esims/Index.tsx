import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { WalletContext } from '../../../providers/wallet'
import { AspContext } from '../../../providers/asp'
import { FiatContext } from '../../../providers/fiat'
import { getEsimSettings, type EsimAsset, type EsimSettings } from '../../../providers/ramp'
import {
  createEsimOrder,
  esimAmountUnits,
  esimState,
  getStoredEsims,
  onEsimsChange,
  openEsimLink,
  payEsimOrder,
  syncEsims,
  type EsimState,
  type StoredEsim,
} from '../../../lib/esims'
import { hasEsimKey } from '../../../lib/esimKey'
import { ASSET_LIST, getWrappedAssetId } from '../../../lib/assets'
import { getUserEmailForBankTransfer } from '../../../lib/kyc'
import { copyToClipboard } from '../../../lib/clipboard'
import { showIntercom } from '../../../lib/intercom'
import { consoleError } from '../../../lib/logs'
import Header from '../../../components/Header'
import Content from '../../../components/Content'
import Padded from '../../../components/Padded'
import FlexCol from '../../../components/FlexCol'
import FlexRow from '../../../components/FlexRow'
import Text, { TextSecondary } from '../../../components/Text'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import Shadow from '../../../components/Shadow'
import Info from '../../../components/Info'
import ErrorMessage from '../../../components/Error'
import Loading from '../../../components/Loading'

// eSIMs bought from ramp-system with ARK-BTC or USDT-CX. The flow and its
// safety rules live in lib/esims.ts; this screen only shows and drives it.

type View = { name: 'list' } | { name: 'buy' } | { name: 'order'; token: string }

const ASSET_LABELS: Record<EsimAsset, string> = { 'ARK-BTC': 'Bitcoin', 'USDT-CX': 'USDT' }
const DECIMALS: Record<EsimAsset, number> = { 'ARK-BTC': 8, 'USDT-CX': 6 }

const formatAmount = (esim: StoredEsim): string => {
  const units = esimAmountUnits(esim)
  if (esim.asset === 'ARK-BTC') return `${units.toLocaleString()} sats`
  const decimals = DECIMALS[esim.asset]
  const whole = units / BigInt(10) ** BigInt(decimals)
  const fraction = (units % BigInt(10) ** BigInt(decimals)).toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${whole}${fraction ? `.${fraction}` : ''} USDT`
}

const formatDate = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

// Assets this wallet can pay ramp with: BTC always, USDT only where it's live
// here and ramp accepts it.
const payableAssets = (settings: EsimSettings | null): EsimAsset[] => {
  const usdtHere = ASSET_LIST.some((a) => a.symbol === 'USDT' && !a.comingSoon) && Boolean(getWrappedAssetId('USDT'))
  return (settings?.assets ?? []).filter((asset) => asset === 'ARK-BTC' || (asset === 'USDT-CX' && usdtHere))
}

function useEsims(): StoredEsim[] {
  const [esims, setEsims] = useState(getStoredEsims)
  useEffect(() => onEsimsChange(setEsims), [])
  return esims
}

export default function AppEsims() {
  const { t } = useTranslation()
  const { navigate } = useContext(NavigationContext)
  const { txs } = useContext(WalletContext)
  const esims = useEsims()

  const [view, setView] = useState<View>({ name: 'list' })
  const [settings, setSettings] = useState<EsimSettings | null>(null)
  const [settingsError, setSettingsError] = useState(false)
  const [syncing, setSyncing] = useState(true)

  // On open: what's on sale, and every order this wallet has at ramp. That
  // listing is what brings eSIMs back on a restored wallet, and it reports any
  // payment this device made but never got to report.
  useEffect(() => {
    getEsimSettings()
      .then(setSettings)
      .catch((err) => {
        consoleError(err, 'Could not load eSIM settings')
        setSettingsError(true)
      })
    syncEsims({ txs, listFromServer: hasEsimKey() })
      .catch((err) => consoleError(err, 'Could not load eSIM orders'))
      .finally(() => setSyncing(false))
    // Once per visit: the background sync keeps orders moving after that
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (view.name === 'buy') {
    return (
      <BuyEsim
        settings={settings}
        onBack={() => setView({ name: 'list' })}
        onCreated={(token) => setView({ name: 'order', token })}
      />
    )
  }

  if (view.name === 'order') {
    const esim = esims.find((e) => e.token === view.token)
    if (esim) return <EsimOrder esim={esim} onBack={() => setView({ name: 'list' })} />
  }

  const canBuy =
    Boolean(settings?.purchase_enabled) && (settings?.available ?? 0) > 0 && payableAssets(settings).length > 0
  // Unpaid orders that expired are clutter, not purchases
  const shown = esims.filter((e) => esimState(e) !== 'expired')

  return (
    <>
      <Header text={t('apps.esims.esims')} back={() => navigate(Pages.Apps)} />
      <Content>
        <Padded>
          <FlexCol gap='1rem'>
            {settingsError ? <ErrorMessage error text={t('apps.esims.unavailable')} /> : null}
            {settings && !settings.purchase_enabled ? (
              <Info color='orange' title={t('apps.esims.notForSale')}>
                <TextSecondary>{t('apps.esims.notForSaleText')}</TextSecondary>
              </Info>
            ) : null}
            {settings && settings.purchase_enabled && settings.available === 0 ? (
              <Info color='orange' title={t('apps.esims.soldOut')}>
                <TextSecondary>{t('apps.esims.soldOutText')}</TextSecondary>
              </Info>
            ) : null}
            {syncing && shown.length === 0 ? <Loading simple /> : null}
            {!syncing && shown.length === 0 ? <TextSecondary>{t('apps.esims.none')}</TextSecondary> : null}
            {shown.map((esim) => (
              <EsimRow key={esim.token} esim={esim} onOpen={() => setView({ name: 'order', token: esim.token })} />
            ))}
          </FlexCol>
        </Padded>
      </Content>
      {canBuy ? (
        <ButtonsOnBottom>
          <Button label={t('apps.esims.buyEsim')} onClick={() => setView({ name: 'buy' })} />
        </ButtonsOnBottom>
      ) : null}
    </>
  )
}

function stateLabel(t: (key: string) => string, state: EsimState): string {
  return t(`apps.esims.state.${state}`)
}

function EsimRow({ esim, onOpen }: { esim: StoredEsim; onOpen: () => void }) {
  const { t } = useTranslation()
  const state = esimState(esim)
  // The IMSI tells delivered eSIMs apart; before delivery the order code does
  const identifier = esim.imsi ? `${t('apps.esims.imsi')} ${esim.imsi}` : `${t('apps.esims.order')} ${esim.code}`
  return (
    <button type='button' onClick={onOpen} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
      <Shadow>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem' }}>
          {/* Only this side gives way on a narrow screen; the status never truncates */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0 }}>
            <Text bold>{esim.plan ?? t('apps.esims.esim')}</Text>
            <TextSecondary>{identifier}</TextSecondary>
            <TextSecondary>{formatDate(esim.createdAt)}</TextSecondary>
          </div>
          <div style={{ flexShrink: 0 }}>
            <Text small color={state === 'ready' ? 'green' : state === 'needsSupport' ? 'red' : 'neutral-500'}>
              {stateLabel(t, state)}
            </Text>
          </div>
        </div>
      </Shadow>
    </button>
  )
}

function BuyEsim({
  settings,
  onBack,
  onCreated,
}: {
  settings: EsimSettings | null
  onBack: () => void
  onCreated: (token: string) => void
}) {
  const { t } = useTranslation()
  const { aspInfo } = useContext(AspContext)
  const { balance, assetBalances } = useContext(WalletContext)
  const { toCurrency, fromCurrency } = useContext(FiatContext)
  const assets = payableAssets(settings)
  const [asset, setAsset] = useState<EsimAsset>(assets[0] ?? 'ARK-BTC')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const price = Number(settings?.price ?? 0)

  // Rough check before reserving an eSIM: the exact amount comes with the order
  const shortOfFunds = useMemo(() => {
    if (asset === 'ARK-BTC') {
      const needed = fromCurrency(price, 'eur')
      return needed > 0 && balance < needed
    }
    const id = getWrappedAssetId('USDT')
    const held = assetBalances.find((a) => a.assetId === id)?.amount ?? 0
    return Number(held) / 10 ** DECIMALS['USDT-CX'] < price
  }, [asset, price, balance, assetBalances, fromCurrency])

  // EUR value of an amount, to refuse an order asking clearly more than the price
  const valueInEur = useCallback(
    (a: EsimAsset, units: bigint): number => {
      if (a === 'ARK-BTC') return toCurrency(Number(units), 'eur')
      const eur = toCurrency(100_000_000, 'eur')
      const usd = toCurrency(100_000_000, 'usd')
      return eur && usd ? (Number(units) / 10 ** DECIMALS['USDT-CX']) * (eur / usd) : 0
    },
    [toCurrency],
  )

  const create = async () => {
    setBusy(true)
    setError('')
    try {
      const esim = await createEsimOrder({
        asset,
        email: getUserEmailForBankTransfer(),
        signerPubkey: aspInfo.signerPubkey,
        valueInEur,
        price,
      })
      onCreated(esim.token)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('apps.esims.createFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Header text={t('apps.esims.buy')} back={onBack} />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
            <ErrorMessage error={Boolean(error)} text={error} />
            <FlexCol gap='0.5rem'>
              <Text big bold>
                {settings?.price} {settings?.fiat_currency}
              </Text>
              <TextSecondary>{t('apps.esims.buyText')}</TextSecondary>
            </FlexCol>
            {assets.length > 1 ? (
              <FlexCol gap='0.5rem'>
                <TextSecondary>{t('apps.esims.payWith')}</TextSecondary>
                <FlexRow gap='0.5rem'>
                  {assets.map((a) => (
                    <Button key={a} small secondary={a !== asset} label={ASSET_LABELS[a]} onClick={() => setAsset(a)} />
                  ))}
                </FlexRow>
              </FlexCol>
            ) : null}
            {shortOfFunds ? (
              <Info color='orange' title={t('apps.esims.lowBalance')}>
                <TextSecondary>{t('apps.esims.lowBalanceText', { asset: ASSET_LABELS[asset] })}</TextSecondary>
              </Info>
            ) : null}
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button
          label={busy ? t('apps.esims.creating') : t('apps.esims.continue')}
          onClick={create}
          disabled={busy || shortOfFunds || !settings}
          loading={busy}
        />
      </ButtonsOnBottom>
    </>
  )
}

const POLL_MS = 5000

function EsimOrder({ esim, onBack }: { esim: StoredEsim; onBack: () => void }) {
  const { t } = useTranslation()
  const { svcWallet, txs } = useContext(WalletContext)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const state = esimState(esim, now)

  // While waiting on payment or delivery: tick the countdown, and keep reading
  // the order so the link shows as soon as it's there.
  useEffect(() => {
    if (state !== 'awaitingPayment' && state !== 'confirming' && state !== 'paying') return
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const poll = setInterval(() => {
      if (state === 'awaitingPayment') return
      syncEsims({ txs, listFromServer: false }).catch((err) => consoleError(err, 'eSIM refresh failed'))
    }, POLL_MS)
    return () => {
      clearInterval(tick)
      clearInterval(poll)
    }
  }, [state, txs])

  const pay = async () => {
    if (!svcWallet) return
    setBusy(true)
    setError('')
    try {
      await payEsimOrder(svcWallet, esim.token)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('apps.esims.payFailed'))
    } finally {
      setBusy(false)
    }
  }

  const open = () => {
    if (esim.link && !openEsimLink(esim.link)) setError(t('apps.esims.badLink'))
  }

  const secondsLeft = esim.expiresAt ? Math.max(0, Math.floor((esim.expiresAt - now) / 1000)) : null

  return (
    <>
      <Header text={esim.plan ?? t('apps.esims.esim')} back={onBack} />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
            <ErrorMessage error={Boolean(error)} text={error} />

            {state === 'ready' ? (
              <Info color='green' title={t('apps.esims.readyTitle')}>
                <TextSecondary>{t('apps.esims.readyText')}</TextSecondary>
              </Info>
            ) : null}

            {state === 'awaitingPayment' ? (
              <Info color='blue' title={t('apps.esims.payTitle', { amount: formatAmount(esim) })}>
                <TextSecondary>
                  {t('apps.esims.payText', {
                    minutes: Math.floor((secondsLeft ?? 0) / 60),
                    seconds: String((secondsLeft ?? 0) % 60).padStart(2, '0'),
                  })}
                </TextSecondary>
              </Info>
            ) : null}

            {state === 'confirming' ? (
              <Info color='blue' title={t('apps.esims.confirmingTitle')}>
                <TextSecondary>{t('apps.esims.confirmingText', { code: esim.code })}</TextSecondary>
              </Info>
            ) : null}

            {state === 'paying' && !busy ? (
              <Info color='orange' title={t('apps.esims.uncertainTitle')}>
                <TextSecondary>{t('apps.esims.uncertainText', { code: esim.code })}</TextSecondary>
              </Info>
            ) : null}

            {state === 'needsSupport' ? (
              <Info color='red' title={t('apps.esims.supportTitle')}>
                <TextSecondary>
                  {esim.paidTooLate
                    ? t('apps.esims.paidTooLateText', { code: esim.code })
                    : esim.linkUnavailable
                      ? t('apps.esims.linkUnavailableText', { code: esim.code })
                      : t('apps.esims.supportText', { code: esim.code })}
                </TextSecondary>
              </Info>
            ) : null}

            {state === 'refunded' ? (
              <Info color='orange' title={t('apps.esims.refundedTitle')}>
                <TextSecondary>{t('apps.esims.refundedText')}</TextSecondary>
              </Info>
            ) : null}

            {state === 'expired' ? (
              <Info color='orange' title={t('apps.esims.expiredTitle')}>
                <TextSecondary>{t('apps.esims.expiredText')}</TextSecondary>
              </Info>
            ) : null}

            <FlexCol gap='0.5rem'>
              <FlexRow between>
                <TextSecondary>{t('apps.esims.order')}</TextSecondary>
                <Text copy={esim.code}>{esim.code}</Text>
              </FlexRow>
              {esim.imsi ? (
                <FlexRow between>
                  <TextSecondary>{t('apps.esims.imsi')}</TextSecondary>
                  <Text copy={esim.imsi}>{esim.imsi}</Text>
                </FlexRow>
              ) : null}
              <FlexRow between>
                <TextSecondary>{t('apps.esims.bought')}</TextSecondary>
                <Text>{formatDate(esim.createdAt)}</Text>
              </FlexRow>
              <FlexRow between>
                <TextSecondary>{t('apps.esims.paid')}</TextSecondary>
                <Text>{formatAmount(esim)}</Text>
              </FlexRow>
            </FlexCol>
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        {state === 'ready' ? (
          <>
            <Button label={t('apps.esims.open')} onClick={open} />
            <Button
              secondary
              label={t('apps.esims.copyLink')}
              onClick={() => esim.link && copyToClipboard(esim.link)}
            />
          </>
        ) : null}
        {state === 'awaitingPayment' ? (
          <Button
            label={busy ? t('apps.esims.paying') : t('apps.esims.pay', { amount: formatAmount(esim) })}
            onClick={pay}
            disabled={busy || !svcWallet || secondsLeft === 0}
            loading={busy}
          />
        ) : null}
        {state === 'needsSupport' || state === 'paying' ? (
          <Button secondary label={t('apps.esims.contactSupport')} onClick={() => showIntercom()} />
        ) : null}
      </ButtonsOnBottom>
    </>
  )
}
