import { CSSProperties, ReactNode, useContext, useEffect, useState } from 'react'
import { CreditCard, Eye, EyeOff, Info, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Header from '../../../components/Header'
import Content from '../../../components/Content'
import Padded from '../../../components/Padded'
import FlexCol from '../../../components/FlexCol'
import Text, { TextSecondary } from '../../../components/Text'
import Button from '../../../components/Button'
import ErrorMessage from '../../../components/Error'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import { WalletContext } from '../../../providers/wallet'
import { authenticateUser } from '../../../lib/biometrics'
import { defaultPassword } from '../../../lib/constants'
import { isValidPassword } from '../../../lib/privateKey'
import {
  WirexCard,
  WirexUser,
  canIssueVirtualCard,
  ensureWirexUser,
  getWirexCards,
  getWirexUserByAddress,
  getWirexVerificationLink,
  issueVirtualCard,
} from '../../../lib/wirex'
import { deployWirexKernelAccount, getWirexEvmAddress } from '../../../lib/wirexWallet'
import { errorText, pickActiveCard, storeWirexAddress, withRetry } from '../../../lib/wirexCard'
import { hapticSubtle } from '../../../lib/haptics'
import { GREY_MEDIUM } from './shared'

interface SetupProps {
  title: string
  /** Opens the card walkthrough again (header info icon). */
  onInfo?: () => void
  initialUser: WirexUser | null
  initialCards: WirexCard[]
  onReady: (user: WirexUser, cards: WirexCard[]) => void
}

type Mode = 'load' | 'create'

export default function WirexSetup({ title, onInfo, initialUser, initialCards, onReady }: SetupProps) {
  const { t } = useTranslation()
  const { wallet } = useContext(WalletContext)

  const [mode, setMode] = useState<Mode>('load')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  // null while checking, wallets without a user password are encrypted with the default one.
  const [hasUserPassword, setHasUserPassword] = useState<boolean | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [email, setEmail] = useState('')
  const [country, setCountry] = useState('')
  const [isPep, setIsPep] = useState(false)

  const [user, setUser] = useState<WirexUser | null>(initialUser)
  const [cards, setCards] = useState<WirexCard[]>(initialCards)
  const [kycUrl, setKycUrl] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (wallet.lockedByBiometrics) return
    let cancelled = false
    isValidPassword(defaultPassword)
      .then((none) => !cancelled && setHasUserPassword(!none))
      .catch(() => !cancelled && setHasUserPassword(true))
    return () => {
      cancelled = true
    }
  }, [wallet.lockedByBiometrics])

  // Wraps every action: one at a time, with a status line and error capture.
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    setError('')
    setNotFound(false)
    try {
      await fn()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy('')
    }
  }
  const resolvePassword = async (): Promise<string | null> => {
    if (wallet.lockedByBiometrics) return authenticateUser(wallet.passkeyId)
    if (!hasUserPassword) return defaultPassword
    if (!(await isValidPassword(password))) {
      setPasswordError(t('apps.wirexCard.withdraw.wrongPassword'))
      return null
    }
    setPasswordError('')
    return password
  }

  const showUser = async (u: WirexUser | null) => {
    setUser(u)
    if (!u) return
    storeWirexAddress(u.user_address)
    // The card lookup needs a user token, which Wirex can't issue until the new
    // user is visible — retry, and don't treat a failure here as fatal.
    try {
      const result = await withRetry(() => getWirexCards(u.user_address), {
        attempts: 4,
        delayMs: 3_000,
        onRetry: (msg) => setBusy(`Loading cards: ${msg}`),
      })
      const loaded = result?.data ?? []
      setCards(loaded)
      if (pickActiveCard(loaded)) onReady(u, loaded)
    } catch (err) {
      setCards([])
      setError(`Couldn't load cards yet (${errorText(err)}) — try Refresh.`)
    }
  }

  const refresh = (address: string) =>
    run('Refreshing account…', async () => showUser(await getWirexUserByAddress(address)))

  const loadAccount = () =>
    run(t('apps.wirexCard.setup.busyLoad'), async () => {
      const pw = await resolvePassword()
      if (pw === null) return
      const address = await getWirexEvmAddress(pw)
      const found = await getWirexUserByAddress(address)
      if (!found) return setNotFound(true)
      await showUser(found)
    })

  const register = () =>
    run(t('apps.wirexCard.setup.busyCreate'), async () => {
      const pw = await resolvePassword()
      if (pw === null) return
      // Derive first, outside any retry: a wrong password fails here, once.
      const userAddress = await getWirexEvmAddress(pw)

      setBusy(t('apps.wirexCard.setup.busyDeploy'))
      await withRetry(() => deployWirexKernelAccount(pw), {
        attempts: 3,
        delayMs: 10_000,
        onRetry: (msg) => setBusy(`${t('apps.wirexCard.setup.busyDeploy')} ${msg}`),
      })

      setBusy(t('apps.wirexCard.setup.busyCreate'))
      const created = await withRetry(() => ensureWirexUser({ userAddress, email: email.trim(), country, isPep }), {
        attempts: 6,
        delayMs: 5_000,
        onRetry: (msg) => setBusy(`${t('apps.wirexCard.setup.busyCreate')} ${msg}`),
      })
      await showUser(created)
    })

  const startKyc = () =>
    run('Getting KYC link…', async () => {
      if (!user) return
      const url = await getWirexVerificationLink(user.user_address)
      setKycUrl(url)
      window.open(url, '_blank', 'noopener,noreferrer')
    })

  const issueCard = () =>
    run('Issuing virtual card…', async () => {
      if (!user) return
      await issueVirtualCard({ userAddress: user.user_address })
      await showUser(await getWirexUserByAddress(user.user_address))
    })

  const disabled = Boolean(busy)

  if (!user) {
    const passwordMissing = Boolean(hasUserPassword) && !wallet.lockedByBiometrics && !password
    const passwordChecking = hasUserPassword === null && !wallet.lockedByBiometrics
    const formInvalid = mode === 'create' && (!email.trim() || country.length !== 2)
    const canSubmit = !disabled && !passwordMissing && !passwordChecking && !formInvalid
    const submit = () => {
      if (!canSubmit) return
      if (mode === 'load') loadAccount()
      else register()
    }
    const switchMode = (next: Mode) => {
      setMode(next)
      setError('')
      setNotFound(false)
    }

    const help = (text: string) => <InfoLine text={text} />

    return (
      <>
        <Header
          text={title}
          logo
          auxIcon={onInfo ? <Info size={20} /> : undefined}
          auxFunc={onInfo}
          auxAriaLabel={t('apps.wirexCard.info')}
        />
        <Content>
          <Padded>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 24 }}>
              <Tabs
                options={[
                  { value: 'load', label: t('apps.wirexCard.setup.tabLoad') },
                  { value: 'create', label: t('apps.wirexCard.setup.tabCreate') },
                ]}
                selected={mode}
                onChange={(value) => switchMode(value as Mode)}
              />

              <div data-testid='wirex-setup-password' style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {wallet.lockedByBiometrics ? (
                  help(t('apps.wirexCard.setup.passwordBiometrics'))
                ) : hasUserPassword === false ? (
                  help(t('apps.wirexCard.setup.passwordNone'))
                ) : (
                  <>
                    <Field
                      label={t('apps.wirexCard.setup.passwordTitle')}
                      right={
                        <button
                          type='button'
                          aria-label={
                            showPassword
                              ? t('apps.wirexCard.setup.hidePassword')
                              : t('apps.wirexCard.setup.showPassword')
                          }
                          onClick={() => setShowPassword((v) => !v)}
                          style={iconButton}
                        >
                          {showPassword ? (
                            <EyeOff size={22} color='var(--white)' />
                          ) : (
                            <Eye size={22} color='var(--white)' />
                          )}
                        </button>
                      }
                    >
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        autoComplete='current-password'
                        placeholder={t('apps.wirexCard.setup.passwordPlaceholder')}
                        aria-label={t('apps.wirexCard.setup.passwordTitle')}
                        data-testid='wirex-setup-password-input'
                        onChange={(e) => {
                          setPassword(e.target.value)
                          setPasswordError('')
                        }}
                        onKeyDown={(e) => (e.key === 'Enter' ? submit() : undefined)}
                        style={inputStyle}
                      />
                    </Field>
                    {passwordError ? <ErrorLine text={passwordError} /> : null}
                  </>
                )}
                {mode === 'load' ? (
                  <>
                    {hasUserPassword && !wallet.lockedByBiometrics
                      ? help(t('apps.wirexCard.setup.passwordHelp'))
                      : null}
                    {help(t('apps.wirexCard.setup.loadHelp'))}
                  </>
                ) : hasUserPassword && !wallet.lockedByBiometrics ? (
                  help(t('apps.wirexCard.setup.passwordHelpCreate'))
                ) : (
                  help(t('apps.wirexCard.setup.createHelp'))
                )}
              </div>

              {mode === 'create' ? (
                <>
                  <Field label={t('apps.wirexCard.setup.email')}>
                    <input
                      type='email'
                      value={email}
                      autoComplete='email'
                      placeholder={t('apps.wirexCard.setup.emailPlaceholder')}
                      aria-label={t('apps.wirexCard.setup.email')}
                      data-testid='wirex-setup-email'
                      onChange={(e) => setEmail(e.target.value)}
                      style={inputStyle}
                    />
                  </Field>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Field label={t('apps.wirexCard.setup.country')}>
                      <input
                        type='text'
                        value={country}
                        maxLength={2}
                        autoCapitalize='characters'
                        autoComplete='country'
                        placeholder={t('apps.wirexCard.setup.countryPlaceholder')}
                        aria-label={t('apps.wirexCard.setup.country')}
                        data-testid='wirex-setup-country'
                        onChange={(e) => setCountry(e.target.value.toUpperCase())}
                        style={inputStyle}
                      />
                    </Field>
                    {help(t('apps.wirexCard.setup.countryHelp'))}
                  </div>
                  <PepToggle
                    checked={isPep}
                    onChange={setIsPep}
                    title={t('apps.wirexCard.setup.pep')}
                    description={t('apps.wirexCard.setup.pepHelp')}
                  />
                </>
              ) : null}

              {busy ? <span style={{ fontSize: 12, color: GREY_MEDIUM }}>{busy}</span> : null}
              {error ? <ErrorLine text={error} /> : null}
              {notFound ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: 12, color: GREY_MEDIUM }}>{t('apps.wirexCard.setup.notFound')}</span>
                  <Button
                    label={t('apps.wirexCard.setup.createInstead')}
                    onClick={() => switchMode('create')}
                    secondary
                    testId='wirex-setup-create-instead'
                  />
                </div>
              ) : null}
            </div>
          </Padded>
        </Content>
        <ButtonsOnBottom>
          <SubmitButton
            label={t(mode === 'load' ? 'apps.wirexCard.setup.ctaLoad' : 'apps.wirexCard.setup.ctaCreate')}
            onClick={submit}
            disabled={!canSubmit}
            loading={disabled}
            icon={mode === 'load' ? <Search size={16} /> : <CreditCard size={16} />}
            testId='wirex-setup-submit'
          />
        </ButtonsOnBottom>
      </>
    )
  }

  return (
    <>
      <Header text={title} />
      <Content>
        <Padded>
          <FlexCol gap='1.25rem'>
            {busy ? <TextSecondary>{busy}</TextSecondary> : null}
            <ErrorMessage error={Boolean(error)} text={error} />

            <>
              <FlexCol gap='0.25rem'>
                <Text bold>Account</Text>
                <TextSecondary wrap>Email: {user.email}</TextSecondary>
                <TextSecondary wrap>Address: {user.user_address}</TextSecondary>
                <TextSecondary wrap>User id: {user.user_id}</TextSecondary>
                <TextSecondary>Status: {user.status ?? '—'}</TextSecondary>
                <TextSecondary>KYC: {user.verificationStatus ?? 'None'}</TextSecondary>
                <Button label='Refresh' onClick={() => refresh(user.user_address)} disabled={disabled} secondary />
              </FlexCol>

              <FlexCol gap='0.5rem'>
                <Text bold>KYC</Text>
                <Button
                  label='Start / continue verification'
                  onClick={startKyc}
                  disabled={disabled || user.verificationStatus === 'Approved'}
                />
                {kycUrl ? (
                  <a href={kycUrl} target='_blank' rel='noopener noreferrer'>
                    <Text>Open verification page</Text>
                  </a>
                ) : null}
              </FlexCol>

              <FlexCol gap='0.25rem'>
                <Text bold>Capabilities</Text>
                {user.capabilities?.length ? (
                  user.capabilities.map((c) => (
                    <TextSecondary key={c.type} wrap>
                      {c.type}: {c.status}
                      {c.status_reason ? ` (${c.status_reason})` : ''}
                    </TextSecondary>
                  ))
                ) : (
                  <TextSecondary>None reported</TextSecondary>
                )}
              </FlexCol>

              <FlexCol gap='0.5rem'>
                <Text bold>Cards</Text>
                {cards.length ? (
                  cards.map((card) => (
                    <TextSecondary key={card.id} wrap>
                      {card.card_data.format} {card.card_data.payment_system} — {card.status} ({card.id})
                    </TextSecondary>
                  ))
                ) : (
                  <TextSecondary>No cards yet</TextSecondary>
                )}
                <Button
                  label='Issue virtual card'
                  onClick={issueCard}
                  disabled={disabled || !canIssueVirtualCard(user)}
                />
                {!canIssueVirtualCard(user) ? (
                  <TextSecondary>Available once the VisaVirtualCard capability is Active.</TextSecondary>
                ) : null}
              </FlexCol>
            </>
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}

// ─── Form pieces (Figma: Card / Register, Card / Login) ─────────────────────

const SURFACE = 'rgba(231, 234, 236, 0.1)'
const FIELD_BG = 'var(--info-container-bg2)' // #25252a

const iconButton: CSSProperties = { display: 'flex', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }

const inputStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  lineHeight: '16px',
  letterSpacing: 1,
  color: 'var(--white)',
  width: '100%',
  padding: 0,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontFamily: 'inherit',
}

/** Info glyph + muted helper text under a field. */
function InfoLine({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '0 4px' }}>
      <Info size={14} color={GREY_MEDIUM} style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: 12, lineHeight: '16px', color: GREY_MEDIUM }}>{text}</span>
    </div>
  )
}

const ErrorLine = ({ text }: { text: string }) => (
  <span style={{ fontSize: 12, padding: '0 4px', color: 'var(--red)' }}>{text}</span>
)

/** "I have an account" / "New account" pill switch. */
function Tabs({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string }[]
  selected: string
  onChange: (value: string) => void
}) {
  return (
    <div role='tablist' style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 16, background: SURFACE }}>
      {options.map((option) => {
        const active = option.value === selected
        return (
          <button
            key={option.value}
            type='button'
            role='tab'
            aria-selected={active}
            data-testid={`wirex-setup-tab-${option.value}`}
            onClick={() => {
              if (active) return
              hapticSubtle()
              onChange(option.value)
            }}
            style={{
              flex: 1,
              height: 36,
              border: 'none',
              borderRadius: 12,
              background: active ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
              color: active ? 'var(--white)' : GREY_MEDIUM,
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background-color 0.2s, color 0.2s',
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** Bordered tile with a radio-style toggle for the PEP declaration. */
function PepToggle({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  title: string
  description: string
}) {
  return (
    <button
      type='button'
      role='checkbox'
      aria-checked={checked}
      data-testid='wirex-setup-pep'
      onClick={() => {
        hapticSubtle()
        onChange(!checked)
      }}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        width: '100%',
        padding: 16,
        borderRadius: 16,
        border: `1px solid ${checked ? 'var(--blue-primary)' : 'rgba(255, 255, 255, 0.1)'}`,
        background: 'transparent',
        color: 'var(--white)',
        fontFamily: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 20,
          height: 20,
          marginTop: 1,
          borderRadius: '50%',
          border: `2px solid ${checked ? 'var(--blue-primary)' : 'var(--white)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxSizing: 'border-box',
        }}
      >
        {checked ? (
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--blue-primary)' }} />
        ) : null}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 12, lineHeight: '16px', color: GREY_MEDIUM }}>{description}</span>
      </span>
    </button>
  )
}

/** Figma "Field": 64px row on #25252a, uppercase caption over the input. */
function Field({ label, right, children }: { label: string; right?: ReactNode; children: ReactNode }) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 64,
        padding: '8px 12px',
        borderRadius: 20,
        background: FIELD_BG,
        boxSizing: 'border-box',
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            lineHeight: '16px',
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: GREY_MEDIUM,
          }}
        >
          {label}
        </span>
        {children}
      </span>
      {right ? <span style={{ display: 'flex', flexShrink: 0 }}>{right}</span> : null}
    </label>
  )
}

/** Bottom CTA: blue when ready, grey with dark text while the form is incomplete. */
function SubmitButton({
  label,
  onClick,
  disabled,
  loading,
  icon,
  testId,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  icon: ReactNode
  testId?: string
}) {
  const off = disabled || loading
  return (
    <button
      type='button'
      data-testid={testId}
      disabled={off}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        height: 48,
        padding: '12px 16px',
        borderRadius: 16,
        border: 'none',
        background: off ? 'rgba(255, 255, 255, 0.25)' : 'var(--blue-primary)',
        color: off ? '#101015' : 'white',
        fontFamily: 'inherit',
        fontSize: 14,
        fontWeight: 600,
        lineHeight: '16px',
        letterSpacing: 1,
        textTransform: 'uppercase',
        cursor: off ? 'default' : 'pointer',
        transition: 'background 0.2s ease, color 0.2s ease',
      }}
    >
      {loading ? <span className='spinner' /> : label}
      <span style={{ display: 'flex', opacity: 0.5 }}>{icon}</span>
    </button>
  )
}
