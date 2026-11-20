
import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { List } from 'lucide-react'
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
import { getAssetConfig } from '../../../lib/assets'
import {
  CARD_CURRENCY,
  CARD_DECIMALS,
  type WithdrawStep,
  errorText,
  getWirexCardBalance,
  getWirexTokens,
  runWirexWithdrawal,
} from '../../../lib/wirexCard'
import {
  CardRowIcon,
  ConfirmTransferButton,
  PercentChips,
  TransferAmount,
  TransferLayout,
  TransferRow,
  TransferRows,
  type MoveAssetsNavData,
  type MoveDirection,
} from './shared'

const ESTIMATE_DEBOUNCE_MS = 400

const fmt = (n: number) => prettyNumber(n, CARD_DECIMALS, true, CARD_DECIMALS)

/** Wirex's expires_at unit is unconfirmed — accept unix seconds or ms. */
const expiresAtMs = (expiresAt: number) => (expiresAt < 1e12 ? expiresAt * 1000 : expiresAt)

/** Display name for a Wirex token ("Tether" for USDT), falling back to the symbol. */
const tokenName = (symbol: string) => getAssetConfig(symbol)?.name ?? symbol

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
    setError('')
    const value = Math.floor(sourceBalance * pct) / 100
    setAmount(value > 0 ? value.toFixed(CARD_DECIMALS).replace(/\.?0+$/, '') : '')
  }

  const flip = () => {
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

  const cardTitle = `${t('apps.wirexCard.card')} · ${fmt(cardBalance)} ${CARD_CURRENCY}`
  const tokenTitle = `${tokenName(token.symbol)} · ${fmt(token.balance)} ${token.symbol}`
  const cardRow = (isSource: boolean) => (
    <TransferRow
      testId='wirex-row-card'
      icon={<CardRowIcon />}
      label={t(isSource ? 'apps.wirexCard.transfer.from' : 'apps.wirexCard.transfer.to', {
        name: t('apps.wirexCard.card'),
      })}
      title={cardTitle}
    />
  )
  const tokenRow = (isSource: boolean) => (
    <TransferRow
      testId='wirex-row-token'
      icon={<AssetIcon symbol={token.symbol} size={36} />}
      label={t(isSource ? 'apps.wirexCard.transfer.from' : 'apps.wirexCard.transfer.to', {
        name: t('apps.wirexCard.transfer.wallet'),
      })}
      title={tokenTitle}
      onClick={tokens.length > 1 ? () => setPickerOpen(true) : undefined}
    />
  )

  const sourceUnit = fromCard ? CARD_CURRENCY : token.symbol
  const targetUnit = fromCard ? token.symbol : CARD_CURRENCY

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
        logo
        back
        auxIcon={<List size={20} />}
        // PLACEHOLDER: the design's list icon (transfer history?) has no content specified yet.
        auxFunc={() => toast(t('apps.wirexCard.comingSoon'))}
        auxAriaLabel={t('apps.wirexCard.transactions')}
      />
      <TransferLayout
        footer={
          <>
            <ConfirmTransferButton
              testId='wirex-confirm'
              label={t('apps.wirexCard.transfer.confirm')}
              onClick={confirm}
              disabled={!canConfirm}
              loading={busy}
            />
            <PercentChips testIdPrefix='wirex-pct' onSelect={setPercent} disabled={busy} />
          </>
        }
      >
        <TransferAmount
          testId='wirex-amount'
          ariaLabel={t('apps.wirexCard.amount')}
          value={amount}
          onChange={changeAmount}
          unit={sourceUnit}
          hint={`≈ ${received ? fmt(received) : '0'} ${targetUnit}`}
          disabled={busy}
        />
        <TransferRows
          from={fromCard ? cardRow(true) : tokenRow(true)}
          to={fromCard ? tokenRow(false) : cardRow(false)}
          onFlip={flip}
        />
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
      </TransferLayout>

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
