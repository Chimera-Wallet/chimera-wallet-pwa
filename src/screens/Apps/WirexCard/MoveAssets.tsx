// Move funds between the Wirex card and a wallet token (design: "Card → USDT").
// Opened from the card home: Top up = toCard, Move assets = fromCard; the
// round arrow button flips direction.

import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, Check, CreditCard, Info } from 'lucide-react'
import Header from '../../../components/Header'
import ErrorMessage from '../../../components/Error'
import SelectSheet from '../../../components/SelectSheet'
import { TextSecondary } from '../../../components/Text'
import { useToast } from '../../../components/Toast'
import AssetIcon from '../../../icons/AssetIcon'
import NeedsPassword from '../../../components/NeedsPassword'
import { NavigationContext } from '../../../providers/navigation'
import {
  CardTransferEstimate,
  WirexWallet,
  estimateCardTransfer,
  getWirexCards,
  getWirexWallet,
  transferToCard,
} from '../../../lib/wirex'
import { defaultPassword } from '../../../lib/constants'
import { isValidPassword } from '../../../lib/privateKey'
import { prettyNumber } from '../../../lib/format'
import { hapticLight } from '../../../lib/haptics'
import { AssetRow, FlipButton } from './components/AssetRow'
import type { MoveAssetsNavData, MoveDirection } from './CardHome'
import {
  CARD_CURRENCY,
  CARD_DECIMALS,
  errorText,
  getWirexCardBalance,
  getWirexTokens,
} from './lib'
import { runWirexWithdrawal, type WithdrawStep } from './withdraw'

const PERCENTAGES = [25, 50, 75, 100]
const ESTIMATE_DEBOUNCE_MS = 400

const fmt = (n: number) => prettyNumber(n, CARD_DECIMALS, true, CARD_DECIMALS)

/** Wirex's expires_at unit is unconfirmed — accept unix seconds or ms. */
const expiresAtMs = (expiresAt: number) => (expiresAt < 1e12 ? expiresAt * 1000 : expiresAt)

const chipStyle: React.CSSProperties = {
  flex: 1,
  height: 34,
  borderRadius: 17,
  border: 'none',
  background: 'var(--dark10)',
  color: 'var(--white)',
  fontSize: 12,
  cursor: 'pointer',
}

const cardIcon = (
  <span
    style={{
      width: 28,
      height: 28,
      borderRadius: '50%',
      background: 'var(--blue-primary)',
      color: 'var(--white)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <CreditCard size={14} />
  </span>
)

export default function WirexMoveAssets() {
  const { t } = useTranslation()
  const { goBack, navigationData } = useContext(NavigationContext)
  const { toast } = useToast()

  const nav = navigationData as Partial<MoveAssetsNavData> | undefined
  const userAddress = nav?.userAddress ?? ''
  const cardId = nav?.cardId ?? ''

  const [direction, setDirection] = useState<MoveDirection>(nav?.direction ?? 'fromCard')
  const [wallet, setWallet] = useState<WirexWallet | null>(null)
  const [tokenSymbol, setTokenSymbol] = useState('USDT')
  const [amount, setAmount] = useState('')
  const [estimate, setEstimate] = useState<CardTransferEstimate | null>(null)
  const [estimateNonce, setEstimateNonce] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [needsPassword, setNeedsPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [withdrawStep, setWithdrawStep] = useState<WithdrawStep>()

  useEffect(() => {
    if (!userAddress) return
    let cancelled = false
    getWirexWallet(userAddress)
      .then((w) => !cancelled && setWallet(w))
      .catch((err) => !cancelled && setError(errorText(err)))
    return () => {
      cancelled = true
    }
  }, [userAddress])

  const tokens = getWirexTokens(wallet)
  const token = tokens.find((tk) => tk.symbol === tokenSymbol) ?? tokens[0]
  const cardBalance = getWirexCardBalance(wallet)
  const fromCard = direction === 'fromCard'
  const sourceBalance = fromCard ? cardBalance : token.balance
  const amountNum = Number(amount) || 0

  // toCard: debounced Wirex estimate; re-run when it expires (estimateNonce).
  useEffect(() => {
    setEstimate(null)
    if (fromCard || !token.address || amountNum <= 0 || !userAddress) return
    let cancelled = false
    const timer = setTimeout(() => {
      estimateCardTransfer({
        userAddress,
        cardId,
        amount,
        currency: CARD_CURRENCY,
        tokenAddresses: [token.address as string],
      })
        .then((e) => !cancelled && setEstimate(e))
        .catch((err) => !cancelled && setError(errorText(err)))
    }, ESTIMATE_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [fromCard, token.address, amount, userAddress, cardId, estimateNonce])

  useEffect(() => {
    if (!estimate) return
    const wait = expiresAtMs(estimate.expires_at) - Date.now()
    if (wait <= 0) return
    const timer = setTimeout(() => setEstimateNonce((n) => n + 1), wait)
    return () => clearTimeout(timer)
  }, [estimate])

  // PLACEHOLDER: fromCard has no estimate endpoint — shown 1:1.
  const received = fromCard ? amountNum : (estimate?.amount ?? 0)

  // Native numeric keyboard input: accept ',' as the decimal separator (iOS
  // shows it in many locales), at most one separator and CARD_DECIMALS places.
  const changeAmount = (raw: string) => {
    const next = raw.replace(',', '.')
    if (!new RegExp(`^\\d*\\.?\\d{0,${CARD_DECIMALS}}$`).test(next)) return
    setError('')
    setAmount(next === '.' ? '0.' : next)
  }

  const setPercent = (pct: number) => {
    hapticLight()
    setError('')
    const value = Math.floor(sourceBalance * pct) / 100
    setAmount(value > 0 ? value.toFixed(CARD_DECIMALS).replace(/\.?0+$/, '') : '')
  }

  const flip = () => {
    hapticLight()
    setDirection((d) => (d === 'fromCard' ? 'toCard' : 'fromCard'))
  }

  const overBalance = amountNum > sourceBalance
  const canConfirm =
    !busy && amountNum > 0 && !overBalance && Boolean(userAddress) && (fromCard || Boolean(estimate && token.address))

  // Card -> the user's own Base address (their Wirex EVM signer, which is
  // `userAddress`): the first hop towards USDT-CX on Ark. Signing needs the
  // wallet password; Wirex's security delay keeps this pending for a while.
  const withdraw = async (password: string) => {
    setBusy(true)
    setError('')
    try {
      if (!wallet) throw new Error(t('apps.wirexCard.withdraw.noWallet'))
      const card = (await getWirexCards(userAddress))?.data.find((c) => c.id === cardId)
      if (!card) throw new Error(t('apps.wirexCard.withdraw.noCard'))
      const result = await runWirexWithdrawal({
        password,
        userAddress,
        card,
        wallet,
        recipient: userAddress as `0x${string}`,
        amount: amountNum,
        onStep: setWithdrawStep,
      })
      toast(t('apps.wirexCard.withdraw.sent', { ticker: result.baseToken.symbol }))
      goBack()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setWithdrawStep(undefined)
      setBusy(false)
    }
  }

  const submitPassword = async (password: string) => {
    if (!(await isValidPassword(password))) {
      setPasswordError(t('apps.wirexCard.withdraw.wrongPassword'))
      return
    }
    setPasswordError('')
    setNeedsPassword(false)
    await withdraw(password)
  }

  const confirm = async () => {
    if (fromCard) {
      // Wallets without a password are encrypted with the default one.
      if (await isValidPassword(defaultPassword)) await withdraw(defaultPassword)
      else setNeedsPassword(true)
      return
    }
    if (!estimate || !token.address) return
    setBusy(true)
    setError('')
    try {
      await transferToCard({ userAddress, estimationId: estimate.estimation_id, tokenAddress: token.address })
      toast(t('apps.wirexCard.transferSent'))
      goBack()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const amountInput = (unit: string) => (
    <span style={{ display: 'flex', alignItems: 'baseline', fontSize: '1.75rem', fontWeight: 700 }}>
      -
      <input
        type='text'
        inputMode='decimal'
        autoFocus
        placeholder='0'
        value={amount}
        onChange={(ev) => changeAmount(ev.target.value)}
        aria-label={t('apps.wirexCard.amount')}
        data-testid='wirex-amount'
        style={{
          width: `${Math.max(1, amount.length) + 0.5}ch`,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--white)',
          font: 'inherit',
          textAlign: 'right',
          padding: 0,
        }}
      />
      {unit === '$' ? '$' : <span style={{ fontSize: '0.75rem', marginLeft: 4 }}>{unit}</span>}
    </span>
  )

  const amountText = (sign: '-' | '+', value: string, unit: string, muted: boolean) => (
    <span
      style={{
        fontSize: '1.75rem',
        fontWeight: 700,
        color: muted ? 'var(--grey)' : 'var(--white)',
        whiteSpace: 'nowrap',
      }}
    >
      {sign}
      {value}
      {unit === '$' ? '$' : <span style={{ fontSize: '0.75rem', marginLeft: 4 }}>{unit}</span>}
    </span>
  )

  const cardRow = (isSource: boolean) => (
    <AssetRow
      testId='wirex-row-card'
      icon={cardIcon}
      name={t('apps.wirexCard.card')}
      sublabel={isSource ? `${t('apps.wirexCard.available')}: ${fmt(cardBalance)} ${CARD_CURRENCY}` : undefined}
      amount={isSource ? amountInput('$') : amountText('+', received ? fmt(received) : '0', '$', true)}
    />
  )

  const tokenRow = (isSource: boolean) => (
    <AssetRow
      testId='wirex-row-token'
      icon={<AssetIcon symbol={token.symbol} size={28} />}
      name={token.symbol}
      onClick={tokens.length > 1 ? () => setPickerOpen(true) : undefined}
      sublabel={isSource ? `${t('apps.wirexCard.available')}: ${fmt(token.balance)} ${token.symbol}` : undefined}
      amount={
        isSource ? amountInput(token.symbol) : amountText('+', received ? fmt(received) : '0', token.symbol, true)
      }
    />
  )

  if (needsPassword) {
    return (
      <>
        <Header text={t('apps.wirexCard.moveAssets')} back={() => setNeedsPassword(false)} />
        <NeedsPassword error={passwordError} onPassword={submitPassword} loading={busy} />
      </>
    )
  }

  return (
    <>
      <Header
        text={fromCard ? t('apps.wirexCard.moveAssets') : t('apps.wirexCard.topUp')}
        back
        auxIcon={<Info size={20} />}
        // PLACEHOLDER: the design's info icon has no content specified yet.
        auxFunc={() => toast(t('apps.wirexCard.comingSoon'))}
        auxAriaLabel={t('apps.wirexCard.info')}
      />
      <div
        style={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '0.75rem',
          minHeight: 0,
          overflowY: 'auto',
          padding: '0.25rem 1rem 0.5rem',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div
            style={{
              position: 'relative',
              background: 'var(--dark10)',
              borderRadius: 8,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ padding: '1.5rem 1rem' }}>{fromCard ? cardRow(true) : tokenRow(true)}</div>
            <div style={{ borderTop: '1px solid var(--black)' }} />
            <div style={{ padding: '1.5rem 1rem' }}>{fromCard ? tokenRow(false) : cardRow(false)}</div>
            <FlipButton onClick={flip}>
              <ArrowDown size={16} />
            </FlipButton>
          </div>
          {!fromCard && estimate ? (
            <TextSecondary>
              {t('apps.wirexCard.fee')}: {fmt(estimate.fee_amount)} {estimate.currency}
            </TextSecondary>
          ) : null}
          {withdrawStep ? (
            <TextSecondary testId='wirex-withdraw-step'>
              {t(withdrawStep === 'card' ? 'apps.wirexCard.withdraw.fromCard' : 'apps.wirexCard.withdraw.delay')}
            </TextSecondary>
          ) : null}
          {overBalance ? <ErrorMessage error text={t('apps.wirexCard.insufficient')} /> : null}
          <ErrorMessage error={Boolean(error)} text={error} />
        </div>

        <button
          type='button'
          data-testid='wirex-confirm'
          disabled={!canConfirm}
          onClick={confirm}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 48,
            padding: '0 1rem',
            borderRadius: 8,
            border: 'none',
            background: 'var(--blue-primary)',
            color: 'var(--white)',
            fontWeight: 600,
            textTransform: 'uppercase',
            cursor: canConfirm ? 'pointer' : 'default',
            opacity: canConfirm ? 1 : 0.5,
          }}
        >
          {t('apps.wirexCard.confirm')}
          <Check size={18} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '0 6px 6px' }}>
        {PERCENTAGES.map((pct) => (
          <button
            key={pct}
            type='button'
            data-testid={`wirex-pct-${pct}`}
            style={chipStyle}
            onClick={() => setPercent(pct)}
          >
            {pct}%
          </button>
        ))}
      </div>

      <SelectSheet
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(id) => setTokenSymbol(id)}
        options={tokens.map((tk) => ({
          id: tk.symbol,
          label: tk.symbol,
          description: `${fmt(tk.balance)} ${tk.symbol}`,
          icon: <AssetIcon symbol={tk.symbol} size={32} />,
        }))}
        selected={token.symbol}
        title={t('apps.wirexCard.selectToken')}
      />
    </>
  )
}
