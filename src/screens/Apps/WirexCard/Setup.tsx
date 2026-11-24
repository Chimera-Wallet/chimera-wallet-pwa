import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Header from '../../../components/Header'
import Content from '../../../components/Content'
import Padded from '../../../components/Padded'
import FlexCol from '../../../components/FlexCol'
import Text, { TextSecondary } from '../../../components/Text'
import Button from '../../../components/Button'
import Input from '../../../components/Input'
import InputPassword from '../../../components/InputPassword'
import ErrorMessage from '../../../components/Error'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import SegmentedControl from '../../../components/SegmentedControl'
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

interface SetupProps {
  title: string
  initialUser: WirexUser | null
  initialCards: WirexCard[]
  onReady: (user: WirexUser, cards: WirexCard[]) => void
}

type Mode = 'load' | 'create'

export default function WirexSetup({ title, initialUser, initialCards, onReady }: SetupProps) {
  const { t } = useTranslation()
  const { wallet } = useContext(WalletContext)

  const [mode, setMode] = useState<Mode>('load')
  const [password, setPassword] = useState('')
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
    const tabLoad = t('apps.wirexCard.setup.tabLoad')
    const tabCreate = t('apps.wirexCard.setup.tabCreate')
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

    return (
      <>
        <Header text={title} />
        <Content>
          <Padded>
            <FlexCol gap='1.5rem'>
              <SegmentedControl
                options={[tabLoad, tabCreate]}
                selected={mode === 'load' ? tabLoad : tabCreate}
                onChange={(value) => switchMode(value === tabCreate ? 'create' : 'load')}
              />

              <FlexCol gap='0.5rem' testId='wirex-setup-password'>
                <Text bold>{t('apps.wirexCard.setup.passwordTitle')}</Text>
                {wallet.lockedByBiometrics ? (
                  <TextSecondary>{t('apps.wirexCard.setup.passwordBiometrics')}</TextSecondary>
                ) : hasUserPassword === false ? (
                  <TextSecondary>{t('apps.wirexCard.setup.passwordNone')}</TextSecondary>
                ) : (
                  <>
                    <TextSecondary>{t('apps.wirexCard.setup.passwordHelp')}</TextSecondary>
                    <InputPassword
                      onChange={(e) => {
                        setPassword(e.target.value)
                        setPasswordError('')
                      }}
                      onEnter={submit}
                      placeholder={t('apps.wirexCard.setup.passwordPlaceholder')}
                    />
                    <ErrorMessage error={Boolean(passwordError)} text={passwordError} />
                  </>
                )}
              </FlexCol>

              {mode === 'load' ? (
                <TextSecondary>{t('apps.wirexCard.setup.loadHelp')}</TextSecondary>
              ) : (
                <FlexCol gap='0.75rem'>
                  <TextSecondary>{t('apps.wirexCard.setup.createHelp')}</TextSecondary>
                  <Input
                    label={t('apps.wirexCard.setup.email')}
                    value={email}
                    onChange={(value: string) => setEmail(value)}
                    testId='wirex-setup-email'
                  />
                  <FlexCol gap='0.25rem'>
                    <Input
                      label={t('apps.wirexCard.setup.country')}
                      placeholder={t('apps.wirexCard.setup.countryPlaceholder')}
                      maxLength={2}
                      value={country}
                      onChange={(value: string) => setCountry(value.toUpperCase())}
                      testId='wirex-setup-country'
                    />
                    <TextSecondary>{t('apps.wirexCard.setup.countryHelp')}</TextSecondary>
                  </FlexCol>
                  <label className='flex w-full cursor-pointer items-center gap-3 rounded-lg border border-neutral-500 p-3'>
                    <input
                      type='checkbox'
                      checked={isPep}
                      onChange={(e) => setIsPep(e.target.checked)}
                      style={{ width: 20, height: 20, accentColor: 'var(--primary)', flexShrink: 0 }}
                    />
                    <FlexCol gap='0.25rem'>
                      <Text small>{t('apps.wirexCard.setup.pep')}</Text>
                      <TextSecondary>{t('apps.wirexCard.setup.pepHelp')}</TextSecondary>
                    </FlexCol>
                  </label>
                </FlexCol>
              )}

              {busy ? <TextSecondary>{busy}</TextSecondary> : null}
              <ErrorMessage error={Boolean(error)} text={error} />
              {notFound ? (
                <FlexCol gap='0.5rem'>
                  <TextSecondary>{t('apps.wirexCard.setup.notFound')}</TextSecondary>
                  <Button
                    label={t('apps.wirexCard.setup.createInstead')}
                    onClick={() => switchMode('create')}
                    secondary
                    testId='wirex-setup-create-instead'
                  />
                </FlexCol>
              ) : null}
            </FlexCol>
          </Padded>
        </Content>
        <ButtonsOnBottom>
          <Button
            label={t(mode === 'load' ? 'apps.wirexCard.setup.ctaLoad' : 'apps.wirexCard.setup.ctaCreate')}
            onClick={submit}
            disabled={!canSubmit}
            loading={disabled}
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
