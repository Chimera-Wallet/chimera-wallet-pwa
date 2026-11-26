import { useCallback, useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ChevronDown, Info, ListFilter, MessagesSquare } from 'lucide-react'
import Content from '../../../components/Content'
import Padded from '../../../components/Padded'
import FlexCol from '../../../components/FlexCol'
import { TextSecondary } from '../../../components/Text'
import ErrorMessage from '../../../components/Error'
import { useToast } from '../../../components/Toast'
import Button from '../../../components/Button'
import Header from '../../../components/Header'
import NeedsPassword from '../../../components/NeedsPassword'
import SelectSheet from '../../../components/SelectSheet'
import { defaultPassword } from '../../../lib/constants'
import { isValidPassword } from '../../../lib/privateKey'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { WalletContext } from '../../../providers/wallet'
import { authenticateUser } from '../../../lib/biometrics'
import { getWirexConfigCompanyId, signWirexActionConfirmation } from '../../../lib/wirexWallet'
import {
  WirexCard,
  WirexUser,
  WirexWallet,
  type WirexWithdrawalRequest,
  createCardRevealSession,
  getWirexWallet,
} from '../../../lib/wirex'
import { prettyNumber } from '../../../lib/format'
import { prettyAssetAmount, requireAssetConfig } from '../../../lib/assets'
import { showIntercom } from '../../../lib/intercom'
import { hapticLight } from '../../../lib/haptics'
import {
  CARD_CURRENCY,
  type WirexCardTx,
  errorText,
  finishPendingWirexWithdrawal,
  getCardLast4,
  getPendingWirexWithdrawals,
  getWirexCardBalance,
  getWirexCardTransactions,
  lockWirexCard,
  msUntilDue,
  pickActiveCard,
  readSelectedCardId,
  storeSelectedCardId,
} from '../../../lib/wirexCard'
import { type PendingTopUp, isWirexTopUpEnabled, readPendingTopUps, trackWirexTopUp } from '../../../lib/wirexTopUp'
import CardDetailsSheet, { type CardDetailsSession } from './CardDetails'
import {
  ActionTile,
  CardArt,
  CardTxRow,
  GREY_LIGHT,
  GREY_MEDIUM,
  type MoveAssetsNavData,
  type MoveDirection,
  type TopUpNavData,
} from './shared'

/** Something that needs the wallet password (key derivation), run once it's unlocked. */
interface PasswordAction {
  title: string
  run: (password: string) => Promise<void>
}

const iconButton: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--white)',
  padding: '0.5rem',
  cursor: 'pointer',
  display: 'flex',
}

const resetButton: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: 'var(--white)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
}

/** Translucent surface (Figma) used for the card block and the transaction groups. */
const SURFACE = 'rgba(231, 234, 236, 0.1)'
const panel: React.CSSProperties = {
  background: SURFACE,
  borderRadius: 16,
  overflow: 'hidden',
}

/** Pale blue used for the frozen state (Figma): status pill, Unfreeze button. */
const FROZEN_ACCENT = '#8cbfff'

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.88,
  color: GREY_MEDIUM,
}

/** Transactions shown before "View all transactions". */
const TX_PREVIEW = 5

const cardStatusStyle = (status: WirexCard['status']) => {
  if (status === 'Active')
    return {
      labelKey: 'apps.wirexCard.status.active',
      color: '#16bf5a',
      background: 'rgba(22, 191, 90, 0.15)',
    }
  if (status === 'Blocked')
    return { labelKey: 'apps.wirexCard.status.frozen', color: FROZEN_ACCENT, background: 'rgba(140, 191, 255, 0.15)' }
  return { labelKey: `apps.wirexCard.status.${status}`, color: 'var(--orange)', background: 'var(--orangebg)' }
}

/** The card's name, else "Card N" by its position in the list. */
const cardName = (card: WirexCard, index: number, t: TFunction) =>
  card.card_data.card_name || t('apps.wirexCard.cardN', { n: index + 1 })

type Period = 'today' | 'thisWeek' | 'earlier'

/** Splits (already date-sorted) transactions into Today / This week / Earlier. */
const groupByPeriod = (txs: WirexCardTx[], now = new Date()) => {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const weekAgo = startOfToday - 6 * 24 * 60 * 60 * 1000
  const period = (ms: number): Period => (ms >= startOfToday ? 'today' : ms >= weekAgo ? 'thisWeek' : 'earlier')
  const groups: { period: Period; txs: WirexCardTx[] }[] = []
  for (const tx of txs) {
    const p = period(tx.date)
    const last = groups[groups.length - 1]
    if (last?.period === p) last.txs.push(tx)
    else groups.push({ period: p, txs: [tx] })
  }
  return groups
}

export default function WirexCardHome({ user, cards: initialCards }: { user: WirexUser; cards: WirexCard[] }) {
  const { t } = useTranslation()
  const { navigate } = useContext(NavigationContext)
  // The app wallet (key unlock); `wallet` below is the Wirex wallet.
  const { wallet: appWallet } = useContext(WalletContext)
  const { toast } = useToast()

  // Local copy so freeze/unfreeze can update the status without a reload.
  const [cards, setCards] = useState(initialCards)
  const [cardId, setCardId] = useState(() => pickActiveCard(initialCards, readSelectedCardId())?.id)
  const [pickingCard, setPickingCard] = useState(false)
  const [locking, setLocking] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [wallet, setWallet] = useState<WirexWallet | null>(null)
  const [txs, setTxs] = useState<WirexCardTx[]>([])
  const [error, setError] = useState('')
  const [pendingTopUps, setPendingTopUps] = useState<PendingTopUp[]>(() => readPendingTopUps(user.user_address))
  const [walletNonce, setWalletNonce] = useState(0)
  const [withdrawals, setWithdrawals] = useState<WirexWithdrawalRequest[]>([])
  const [passwordAction, setPasswordAction] = useState<PasswordAction>()
  const [passwordError, setPasswordError] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [busyFinish, setBusyFinish] = useState(false)
  const [openingDetails, setOpeningDetails] = useState(false)
  // Tokens for the card-details frames; in memory only, dropped on close.
  const [detailsSession, setDetailsSession] = useState<CardDetailsSession | null>(null)

  const current = cards.find((c) => c.id === cardId) ?? cards[0]

  // Time-locked withdrawals requested earlier (Move assets) but not executed yet.
  useEffect(() => {
    let cancelled = false
    getPendingWirexWithdrawals(user.user_address).then((list) => !cancelled && setWithdrawals(list))
    return () => {
      cancelled = true
    }
  }, [user.user_address, walletNonce])

  // Re-runs every time the tab is (re)entered, since the screen remounts.
  useEffect(() => {
    let cancelled = false
    getWirexWallet(user.user_address)
      .then((w) => !cancelled && setWallet(w))
      .catch((err) => !cancelled && setError(errorText(err)))
    return () => {
      cancelled = true
    }
  }, [user.user_address, walletNonce])

  // Resume tracking top-ups started earlier (TopUp.tsx); refresh the balance
  // once one is credited.
  useEffect(() => {
    const controller = new AbortController()
    for (const pending of readPendingTopUps(user.user_address)) {
      trackWirexTopUp(pending, { signal: controller.signal })
        .then((final) => {
          setPendingTopUps(readPendingTopUps(user.user_address))
          if (final.phase === 'credited') setWalletNonce((n) => n + 1)
        })
        .catch(() => {
          // aborted on unmount; resumes next time
        })
    }
    return () => controller.abort()
  }, [user.user_address])

  useEffect(() => {
    let cancelled = false
    setTxs([])
    getWirexCardTransactions(user.user_address, current.id)
      .then((list) => !cancelled && setTxs(list))
      .catch((err) => !cancelled && setError(errorText(err)))
    return () => {
      cancelled = true
    }
  }, [user.user_address, current.id])

  const balance = getWirexCardBalance(wallet)
  const locked = current.status === 'Blocked'

  // Unlocks the wallet key for `action`: biometrics, the default password
  // (wallets without one are encrypted with it), or the password screen.
  const withPassword = async (action: PasswordAction) => {
    try {
      if (appWallet.lockedByBiometrics) return await action.run(await authenticateUser(appWallet.passkeyId))
      if (await isValidPassword(defaultPassword)) return await action.run(defaultPassword)
    } catch (err) {
      return setError(errorText(err))
    }
    setPasswordError('')
    setPasswordAction(action)
  }

  const submitPassword = async (password: string) => {
    if (!passwordAction) return
    if (!(await isValidPassword(password))) return setPasswordError(t('apps.wirexCard.withdraw.wrongPassword'))
    setPasswordBusy(true)
    try {
      await passwordAction.run(password)
    } finally {
      setPasswordBusy(false)
      setPasswordAction(undefined)
    }
  }

  const finishWithdrawal = async (request: WirexWithdrawalRequest, password: string) => {
    setBusyFinish(true)
    setError('')
    try {
      await finishPendingWirexWithdrawal(password, request)
      toast(t('apps.wirexCard.withdraw.sent', { ticker: 'USDC' }))
      setWalletNonce((n) => n + 1)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusyFinish(false)
    }
  }

  const startFinish = (request: WirexWithdrawalRequest) =>
    withPassword({ title: t('apps.wirexCard.withdraw.finish'), run: (password) => finishWithdrawal(request, password) })

  // Card details: sign Wirex's GetCardDetails confirmation with the wallet key,
  // exchange it (via our backend, which only answers if Wirex accepts the
  // signature) for the reveal tokens, then open the sheet.
  const revealDetails = async (password: string) => {
    setOpeningDetails(true)
    setError('')
    try {
      const [confirmation, clientId] = await Promise.all([
        signWirexActionConfirmation(password, 'GetCardDetails'),
        getWirexConfigCompanyId(),
      ])
      if (confirmation.address.toLowerCase() !== user.user_address.toLowerCase()) {
        throw new Error(t('apps.wirexCard.cardDetails.otherWallet'))
      }
      const session = await createCardRevealSession({
        userAddress: confirmation.address,
        nonce: confirmation.nonce,
        signature: confirmation.signature,
      })
      setDetailsSession({ ...session, clientId, userAddress: confirmation.address })
    } catch (err) {
      setError(errorText(err))
    } finally {
      setOpeningDetails(false)
    }
  }

  const showDetails = () => {
    if (openingDetails) return
    void withPassword({ title: t('apps.wirexCard.cardDetails.title'), run: revealDetails })
  }

  const closeDetails = useCallback(() => setDetailsSession(null), [])

  const topUp = () => {
    if (!isWirexTopUpEnabled()) return moveAssets('toCard')
    const data: TopUpNavData = { userAddress: user.user_address, cardId: current.id }
    navigate(Pages.AppWirexTopUp, { ...data })
  }

  const moveAssets = (direction: MoveDirection) => {
    const data: MoveAssetsNavData = { direction, userAddress: user.user_address, cardId: current.id }
    navigate(Pages.AppWirexMoveAssets, { ...data })
  }

  const toggleLock = async () => {
    if (locking) return
    setLocking(true)
    setError('')
    try {
      const updated = await lockWirexCard(user.user_address, current, !locked)
      setCards((list) => list.map((c) => (c.id === updated.id ? updated : c)))
      toast(updated.status === 'Blocked' ? t('apps.wirexCard.frozenToast') : t('apps.wirexCard.unfrozenToast'))
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLocking(false)
    }
  }

  const selectCard = (id: string) => {
    if (id === current.id) return
    setCardId(id)
    storeSelectedCardId(id)
    setShowAll(false)
    setError('')
    setDetailsSession(null)
  }

  const openSupport = () => {
    hapticLight()
    try {
      showIntercom()
    } catch {
      toast(t('apps.wirexCard.comingSoon'))
    }
  }

  // PLACEHOLDER: the design's info icon has no content specified yet.
  const openInfo = () => toast(t('apps.wirexCard.comingSoon'))
  // PLACEHOLDER: transaction filters aren't specified yet.
  const openFilter = () => toast(t('apps.wirexCard.comingSoon'))

  if (passwordAction) {
    return (
      <>
        <Header text={passwordAction.title} back={() => setPasswordAction(undefined)} />
        <NeedsPassword error={passwordError} onPassword={submitPassword} loading={passwordBusy} />
      </>
    )
  }

  const status = cardStatusStyle(current.status)
  const groups = groupByPeriod(showAll ? txs : txs.slice(0, TX_PREVIEW))

  return (
    <Content noRefresh>
      <Padded>
        <FlexCol stretch gap='1.25rem'>
          <div style={{ display: 'flex', justifyContent: 'space-between', margin: '-1rem -0.5rem 0' }}>
            <button type='button' style={iconButton} onClick={openSupport} aria-label={t('apps.wirexCard.support')}>
              <MessagesSquare size={20} />
            </button>
            <button type='button' style={iconButton} onClick={openInfo} aria-label={t('apps.wirexCard.info')}>
              <Info size={20} />
            </button>
          </div>

          <div
            style={{
              background: SURFACE,
              borderRadius: 24,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {cards.length > 1 ? (
              <button
                type='button'
                data-testid='wirex-card-select'
                onClick={() => {
                  hapticLight()
                  setPickingCard(true)
                }}
                aria-label={t('apps.wirexCard.selectCard')}
                style={{
                  ...resetButton,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  margin: '-0.25rem 0.25rem 0',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600 }}>{cardName(current, cards.indexOf(current), t)}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--grey)' }}>
                  {t('apps.wirexCard.cardPosition', { n: cards.indexOf(current) + 1, total: cards.length })}
                  <ChevronDown size={16} />
                </span>
              </button>
            ) : null}
            <CardArt
              width='100%'
              last4={getCardLast4(current)}
              frozenLabel={locked ? t('apps.wirexCard.cardFrozen') : undefined}
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                type='button'
                onClick={() => setHidden((h) => !h)}
                aria-label={hidden ? t('apps.wirexCard.showBalance') : t('apps.wirexCard.hideBalance')}
                style={{ ...resetButton, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
              >
                <span style={{ fontSize: 14, color: GREY_LIGHT }}>{t('apps.wirexCard.cardBalance')}</span>
                <span data-testid='wirex-card-balance' style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 32, fontWeight: 600, lineHeight: 'normal' }}>
                    {hidden ? '••••••' : prettyNumber(balance, 2, true, 2)}
                  </span>
                  <span style={{ fontSize: 16 }}>{CARD_CURRENCY}</span>
                </span>
              </button>
              <span
                data-testid='wirex-card-status'
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flexShrink: 0,
                  padding: '4px 10px',
                  borderRadius: 12,
                  fontSize: 10,
                  fontWeight: 600,
                  lineHeight: 'normal',
                  letterSpacing: 0.8,
                  textTransform: 'uppercase',
                  color: status.color,
                  background: status.background,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                {t(status.labelKey, { defaultValue: current.status })}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
              <ActionTile
                testId='wirex-top-up'
                icon={<img src='/images/icons/Plus.png' alt='' />}
                iconBackground='var(--blue-primary)'
                label={t('apps.wirexCard.topUp')}
                onClick={topUp}
                disabled={locked}
              />
              <ActionTile
                testId='wirex-lock'
                icon={
                  <img
                    src={locked ? '/images/card/snowflake-dark.svg' : '/images/icons/Snowflake.png'}
                    alt=''
                    width={locked ? 18 : 24}
                    height={locked ? 18 : 24}
                  />
                }
                iconBackground={locked ? FROZEN_ACCENT : undefined}
                label={locked ? t('apps.wirexCard.unfreeze') : t('apps.wirexCard.freeze')}
                onClick={toggleLock}
                disabled={locking}
              />
              <ActionTile
                testId='wirex-details'
                icon={<img src='/images/icons/Open.png' alt='' />}
                label={t('apps.wirexCard.details')}
                onClick={showDetails}
                disabled={openingDetails}
              />
              <ActionTile
                testId='wirex-move-assets'
                icon={<img src='/images/icons/Vertical.png' alt='' />}
                label={t('apps.wirexCard.toWallet')}
                onClick={() => moveAssets('fromCard')}
                disabled={locked}
              />
            </div>
          </div>

          {pendingTopUps.map((p) => (
            <TextSecondary key={p.quoteId}>
              {t('apps.wirexCard.topUpPending', {
                amount: prettyAssetAmount(BigInt(p.amount), requireAssetConfig(p.symbol).precision),
                ticker: p.symbol,
              })}
            </TextSecondary>
          ))}

          {withdrawals.map((w) => {
            const wait = msUntilDue(w)
            return (
              <FlexCol key={w.hash} gap='0.25rem'>
                <TextSecondary>
                  {t('apps.wirexCard.withdraw.pending', { amount: prettyNumber(w.amount, 2, true, 2) })}
                  {wait > 0 ? ` · ${t('apps.wirexCard.withdraw.readyIn', { minutes: Math.ceil(wait / 60_000) })}` : ''}
                </TextSecondary>
                {wait === 0 ? (
                  <Button
                    small
                    secondary
                    label={t('apps.wirexCard.withdraw.finish')}
                    loading={busyFinish}
                    disabled={busyFinish}
                    onClick={() => startFinish(w)}
                  />
                ) : null}
              </FlexCol>
            )
          })}

          <ErrorMessage error={Boolean(error)} text={error} />

          <FlexCol stretch gap='0.75rem'>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 4 }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>{t('apps.wirexCard.transactions')}</span>
              <button type='button' style={iconButton} onClick={openFilter} aria-label={t('apps.wirexCard.filter')}>
                <ListFilter size={20} />
              </button>
            </div>

            {groups.length ? (
              groups.map((g) => (
                <FlexCol stretch key={g.period} gap='0.75rem'>
                  <span style={sectionLabel}>{t(`apps.wirexCard.period.${g.period}`).toUpperCase()}</span>
                  <div style={panel}>
                    {g.txs.map((tx, i) => (
                      <div key={tx.id}>
                        {/* Figma "Divider / Transactions": 6% white hairline, inset 54px to line up with the text. */}
                        {i ? (
                          <div
                            style={{ height: 1, margin: '0 16px 0 54px', background: 'rgba(255, 255, 255, 0.06)' }}
                          />
                        ) : null}
                        <CardTxRow tx={tx} />
                      </div>
                    ))}
                  </div>
                </FlexCol>
              ))
            ) : (
              <TextSecondary>{t('apps.wirexCard.noTransactions')}</TextSecondary>
            )}

            {txs.length > TX_PREVIEW ? (
              <button
                type='button'
                onClick={() => setShowAll((v) => !v)}
                style={{ ...resetButton, alignSelf: 'center', padding: '0.5rem', fontSize: 14, fontWeight: 600 }}
              >
                {showAll ? t('apps.wirexCard.showLess') : t('apps.wirexCard.viewAll')}
              </button>
            ) : null}
          </FlexCol>
        </FlexCol>
      </Padded>
      <CardDetailsSheet card={current} session={detailsSession} onClose={closeDetails} />
      <SelectSheet
        isOpen={pickingCard}
        onClose={() => setPickingCard(false)}
        onSelect={selectCard}
        selected={current.id}
        title={t('apps.wirexCard.selectCard')}
        options={cards.map((c, i) => {
          const last4 = getCardLast4(c)
          return {
            id: c.id,
            label: cardName(c, i, t),
            description: [
              `${c.card_data.payment_system} ${c.card_data.format}`,
              last4 ? `•• ${last4}` : undefined,
              t(cardStatusStyle(c.status).labelKey, { defaultValue: c.status }),
            ]
              .filter(Boolean)
              .join(' · '),
            icon: <CardArt width={48} radius={4} last4={last4} style={{ filter: 'none' }} />,
          }
        })}
      />
    </Content>
  )
}
