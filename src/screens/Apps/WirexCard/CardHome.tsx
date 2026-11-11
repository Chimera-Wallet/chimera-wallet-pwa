import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUpDown, CirclePlus, CreditCard, Info, MessagesSquare, Snowflake } from 'lucide-react'
import Content from '../../../components/Content'
import Padded from '../../../components/Padded'
import FlexCol from '../../../components/FlexCol'
import Text, { TextSecondary } from '../../../components/Text'
import ErrorMessage from '../../../components/Error'
import { useToast } from '../../../components/Toast'
import Button from '../../../components/Button'
import Header from '../../../components/Header'
import NeedsPassword from '../../../components/NeedsPassword'
import { defaultPassword } from '../../../lib/constants'
import { isValidPassword } from '../../../lib/privateKey'
import { NavigationContext, Pages } from '../../../providers/navigation'
import {
  WirexCard,
  WirexUser,
  WirexWallet,
  type WirexWithdrawalRequest,
  getWirexWallet,
} from '../../../lib/wirex'
import { prettyNumber } from '../../../lib/format'
import { prettyAssetAmount, requireAssetConfig } from '../../../lib/assets'
import { showIntercom } from '../../../lib/intercom'
import { hapticLight } from '../../../lib/haptics'
import CardVisual from './components/CardVisual'
import ActionTile from './components/ActionTile'
import CardTxRow from './components/CardTxRow'
import {
  CARD_CURRENCY,
  NotImplementedError,
  WirexCardTx,
  errorText,
  getCardLast4,
  getWirexCardBalance,
  getWirexCardTransactions,
  lockWirexCard,
} from './lib'
import { PendingTopUp, isWirexTopUpEnabled, readPendingTopUps, trackWirexTopUp } from './topUp'
import type { TopUpNavData } from './TopUp'
import { finishPendingWirexWithdrawal, getPendingWirexWithdrawals, msUntilDue } from './withdraw'

export type MoveDirection = 'fromCard' | 'toCard'

export interface MoveAssetsNavData {
  direction: MoveDirection
  userAddress: string
  cardId: string
}

const iconButton: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--white)',
  padding: '0.5rem',
  cursor: 'pointer',
  display: 'flex',
}

export default function WirexCardHome({ user, card }: { user: WirexUser; card: WirexCard }) {
  const { t } = useTranslation()
  const { navigate } = useContext(NavigationContext)
  const { toast } = useToast()

  const [hidden, setHidden] = useState(false)
  const [wallet, setWallet] = useState<WirexWallet | null>(null)
  const [txs, setTxs] = useState<WirexCardTx[]>([])
  const [error, setError] = useState('')
  const [pendingTopUps, setPendingTopUps] = useState<PendingTopUp[]>(() => readPendingTopUps(user.user_address))
  const [walletNonce, setWalletNonce] = useState(0)
  const [withdrawals, setWithdrawals] = useState<WirexWithdrawalRequest[]>([])
  const [finishing, setFinishing] = useState<WirexWithdrawalRequest>()
  const [passwordError, setPasswordError] = useState('')
  const [busyFinish, setBusyFinish] = useState(false)

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
    getWirexCardTransactions(user.user_address, card.id)
      .then((list) => !cancelled && setTxs(list))
      .catch((err) => !cancelled && setError(errorText(err)))
    return () => {
      cancelled = true
    }
  }, [user.user_address, card.id])

  const balance = getWirexCardBalance(wallet)
  const locked = card.status === 'Blocked'

  const finishWithdrawal = async (request: WirexWithdrawalRequest, password: string) => {
    setBusyFinish(true)
    setError('')
    try {
      await finishPendingWirexWithdrawal(password, request)
      toast(t('apps.wirexCard.withdraw.sent', { ticker: 'USDC' }))
      setFinishing(undefined)
      setWalletNonce((n) => n + 1)
    } catch (err) {
      setFinishing(undefined)
      setError(errorText(err))
    } finally {
      setBusyFinish(false)
    }
  }

  const startFinish = async (request: WirexWithdrawalRequest) => {
    // Wallets without a password are encrypted with the default one.
    if (await isValidPassword(defaultPassword)) return finishWithdrawal(request, defaultPassword)
    setPasswordError('')
    setFinishing(request)
  }

  const submitPassword = async (password: string) => {
    if (!finishing) return
    if (!(await isValidPassword(password))) return setPasswordError(t('apps.wirexCard.withdraw.wrongPassword'))
    await finishWithdrawal(finishing, password)
  }

  const topUp = () => {
    if (!isWirexTopUpEnabled()) return moveAssets('toCard')
    const data: TopUpNavData = { userAddress: user.user_address, cardId: card.id }
    navigate(Pages.AppWirexTopUp, { ...data })
  }

  const moveAssets = (direction: MoveDirection) => {
    const data: MoveAssetsNavData = { direction, userAddress: user.user_address, cardId: card.id }
    navigate(Pages.AppWirexMoveAssets, { ...data })
  }

  const toggleLock = async () => {
    try {
      await lockWirexCard(user.user_address, card.id, !locked)
    } catch (err) {
      if (err instanceof NotImplementedError) toast(t('apps.wirexCard.comingSoon'))
      else setError(errorText(err))
    }
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

  if (finishing) {
    return (
      <>
        <Header text={t('apps.wirexCard.withdraw.finish')} back={() => setFinishing(undefined)} />
        <NeedsPassword error={passwordError} onPassword={submitPassword} loading={busyFinish} />
      </>
    )
  }

  return (
    <Content noRefresh>
      <Padded>
        <FlexCol gap='1.25rem'>
          <div style={{ position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                inset: '0 0 auto 0',
                display: 'flex',
                justifyContent: 'space-between',
                zIndex: 1,
              }}
            >
              <button type='button' style={iconButton} onClick={openSupport} aria-label={t('apps.wirexCard.support')}>
                <MessagesSquare size={22} />
              </button>
              <button type='button' style={iconButton} onClick={openInfo} aria-label={t('apps.wirexCard.info')}>
                <Info size={22} />
              </button>
            </div>
            <div style={{ padding: '0 2.75rem' }}>
              <CardVisual last4={getCardLast4(card)} hidden={hidden} onToggleHidden={() => setHidden((h) => !h)} />
            </div>
          </div>

          <FlexCol centered gap='0.25rem'>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: 'var(--blue-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CreditCard size={12} />
              </span>
              <Text>{t('apps.wirexCard.cardBalance')}</Text>
            </div>
            <div data-testid='wirex-card-balance' style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
              <span style={{ fontSize: '2.25rem', fontWeight: 700 }}>
                {hidden ? '••••••' : prettyNumber(balance, 2, true, 2)}
              </span>
              <span style={{ fontSize: '1rem' }}>{CARD_CURRENCY}</span>
            </div>
          </FlexCol>

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <ActionTile
              testId='wirex-top-up'
              icon={<CirclePlus size={18} />}
              label={t('apps.wirexCard.topUp')}
              onClick={topUp}
            />
            <ActionTile
              testId='wirex-lock'
              icon={<Snowflake size={18} />}
              label={locked ? t('apps.wirexCard.unlockCard') : t('apps.wirexCard.lockCard')}
              onClick={toggleLock}
            />
            <ActionTile
              testId='wirex-move-assets'
              icon={<ArrowUpDown size={18} />}
              label={t('apps.wirexCard.moveAssets')}
              onClick={() => moveAssets('fromCard')}
            />
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
                  {wait > 0
                    ? ` · ${t('apps.wirexCard.withdraw.readyIn', { minutes: Math.ceil(wait / 60_000) })}`
                    : ''}
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

          <FlexCol gap='0.25rem'>
            <Text bold big>
              {t('apps.wirexCard.transactions')}
            </Text>
            {txs.length ? (
              txs.map((tx) => <CardTxRow key={tx.id} tx={tx} />)
            ) : (
              <TextSecondary>{t('apps.wirexCard.noTransactions')}</TextSecondary>
            )}
          </FlexCol>
        </FlexCol>
      </Padded>
    </Content>
  )
}
