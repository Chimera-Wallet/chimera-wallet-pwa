// TEMPORARY placeholder dashboard for exercising the Wirex integration end to end:
// register (on-chain wallet + Wirex user), hosted KYC, capabilities, virtual cards.
// Self-contained on purpose — talks to ../../lib/wirex(Wallet) directly rather
// than through the WirexProvider, so it can be deleted without touching anything else.

import { useContext, useEffect, useState } from 'react'
import Header from './Header'
import Content from '../../components/Content'
import Padded from '../../components/Padded'
import FlexCol from '../../components/FlexCol'
import Text, { TextSecondary } from '../../components/Text'
import Button from '../../components/Button'
import Input from '../../components/Input'
import InputPassword from '../../components/InputPassword'
import ErrorMessage from '../../components/Error'
import { WalletContext } from '../../providers/wallet'
import { authenticateUser } from '../../lib/biometrics'
import { defaultPassword } from '../../lib/constants'
import {
  WirexCard,
  WirexUser,
  WirexWallet,
  canIssueVirtualCard,
  ensureWirexUser,
  getWirexCards,
  getWirexUserByAddress,
  getWirexVerificationLink,
  getWirexWallet,
  issueVirtualCard,
  mintWirexTestUsdt,
} from '../../lib/wirex'
import { deployWirexKernelAccount, getWirexEvmAddress } from '../../lib/wirexWallet'

// The signer address isn't secret; remembering it lets the account reload without a password.
const ADDRESS_KEY = 'wirexDevUserAddress'
const readAddress = () => {
  try {
    return localStorage.getItem(ADDRESS_KEY)
  } catch {
    return null
  }
}
const storeAddress = (address: string) => {
  try {
    localStorage.setItem(ADDRESS_KEY, address)
  } catch {
    // non-fatal
  }
}

// Wirex's Base Sepolia test tokens decimals read on-chain.
const SANDBOX_TOKENS = [
  { symbol: 'USDC', address: '0x7Af7cDbd557eD302F7538Db1e3d094C8BBcA665c', decimals: 6 },
  { symbol: 'USDT', address: '0x2C6c7c00ACa9B9D8446d107367485079b0471706', decimals: 18 },
]
// Through our CORS proxy (api/wirex/rpcProxy.ts), which only allows Wirex hosts.
const SANDBOX_RPC = `/api/wirex-rpc-proxy?target=${encodeURIComponent('https://node-base.wirexapp.tech')}`

/** ERC-20 balanceOf via a raw eth_call, as a decimal string. */
const readErc20Balance = async (token: string, owner: string, decimals: number): Promise<string> => {
  const data = `0x70a08231${owner.replace(/^0x/i, '').toLowerCase().padStart(64, '0')}`
  const res = await fetch(SANDBOX_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: token, data }, 'latest'] }),
  })
  const body = (await res.json()) as { result?: string; error?: { message?: string } }
  if (!body.result) throw new Error(body.error?.message ?? `eth_call failed: ${res.status}`)
  const raw = BigInt(body.result)
  const unit = BigInt(10) ** BigInt(decimals)
  const frac = (raw % unit).toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${raw / unit}${frac ? `.${frac}` : ''}`
}

// Wirex's Base Sepolia test USDT has 18 decimals: 100 USDT.
const TEST_MINT_AMOUNT = (BigInt(100) * BigInt(10) ** BigInt(18)).toString()
const isSandbox = import.meta.env.VITE_WIREX_SDK_ENV !== 'prod'

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Errors that no amount of waiting will fix — fail straight away on these.
const PERMANENT_ERRORS = ['Invalid residence country', 'ErrorAlreadyExists', 'Missing VITE_', 'Invalid Wirex company id']
const isPermanent = (err: unknown) => PERMANENT_ERRORS.some((p) => errorText(err).includes(p))

/**
 * Wirex lags behind the chain and behind its own writes (a just-registered wallet
 * or just-created user isn't visible for a few seconds), so the steps below are
 * retried with a growing delay instead of failing on the first attempt.
 * Every retried step is idempotent (deploy skips finished steps, ensureWirexUser
 * looks up before creating), so repeating one is safe.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts, delayMs, onRetry }: { attempts: number; delayMs: number; onRetry: (msg: string) => void },
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= attempts || isPermanent(err)) throw err
      const wait = delayMs * attempt
      onRetry(`attempt ${attempt}/${attempts} failed (${errorText(err)}), retrying in ${wait / 1000}s…`)
      await sleep(wait)
    }
  }
}

export default function Wirex() {
  const { wallet } = useContext(WalletContext)

  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [country, setCountry] = useState('')
  const [isPep, setIsPep] = useState(false)

  const [user, setUser] = useState<WirexUser | null>(null)
  const [cards, setCards] = useState<WirexCard[]>([])
  const [kycUrl, setKycUrl] = useState('')
  const [wirexWallet, setWirexWallet] = useState<WirexWallet | null>(null)
  const [signerBalances, setSignerBalances] = useState<{ symbol: string; balance: string }[]>([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  // Wraps every action: one at a time, with a status line and error capture.
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    setError('')
    try {
      await fn()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy('')
    }
  }

  const resolvePassword = async (): Promise<string> => {
    if (wallet.lockedByBiometrics) return authenticateUser(wallet.passkeyId)
    return password || defaultPassword
  }

  const showUser = async (u: WirexUser | null) => {
    setUser(u)
    if (!u) return
    storeAddress(u.user_address)
    // The card lookup needs a user token, which Wirex can't issue until the new
    // user is visible — retry, and don't treat a failure here as fatal.
    try {
      const result = await withRetry(() => getWirexCards(u.user_address), {
        attempts: 4,
        delayMs: 3_000,
        onRetry: (msg) => setBusy(`Loading cards: ${msg}`),
      })
      setCards(result?.data ?? [])
    } catch (err) {
      setCards([])
      setError(`Couldn't load cards yet (${errorText(err)}) — try Refresh.`)
    }
  }

  const refresh = (address: string) =>
    run('Refreshing account…', async () => showUser(await getWirexUserByAddress(address)))

  // Reload a previously used account on mount.
  useEffect(() => {
    const address = readAddress()
    if (address) refresh(address)
  }, [])

  const loadAccount = () =>
    run('Looking up account…', async () => {
      const address = await getWirexEvmAddress(await resolvePassword())
      const found = await getWirexUserByAddress(address)
      if (!found) throw new Error(`No Wirex account for ${address} yet — register below.`)
      await showUser(found)
    })

  const register = () =>
    run('Registering…', async () => {
      const pw = await resolvePassword()
      // Derive first, outside any retry: a wrong password fails here, once.
      const userAddress = await getWirexEvmAddress(pw)

      setBusy('Deploying + registering wallet on-chain (can take a minute)…')
      await withRetry(() => deployWirexKernelAccount(pw), {
        attempts: 3,
        delayMs: 10_000,
        onRetry: (msg) => setBusy(`Deploying wallet: ${msg}`),
      })

      setBusy('Creating Wirex user…')
      const created = await withRetry(
        () => ensureWirexUser({ userAddress, email: email.trim(), country, isPep }),
        { attempts: 6, delayMs: 5_000, onRetry: (msg) => setBusy(`Creating Wirex user: ${msg}`) },
      )
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

  const loadWallet = () =>
    run('Loading wallet…', async () => {
      if (!user) return
      setWirexWallet(await getWirexWallet(user.user_address))
      // Withdrawals (card -> Move assets) land on the signer address, which
      // is the Wirex user_address.
      if (isSandbox) {
        setSignerBalances(
          await Promise.all(
            SANDBOX_TOKENS.map(async (tk) => ({
              symbol: tk.symbol,
              balance: await readErc20Balance(tk.address, user.user_address, tk.decimals),
            })),
          ),
        )
      }
    })

  // Staging check for the card top-up's Wirex leg: does a plain USDT deposit to
  // the Wirex wallet become WUSD (card balance).
  const mintTestUsdt = () =>
    run('Minting 100 test USDT…', async () => {
      if (!user) return
      const w = await getWirexWallet(user.user_address)
      if (!w?.wallet_address) throw new Error('No Wirex wallet yet')
      await mintWirexTestUsdt(w.wallet_address, TEST_MINT_AMOUNT)
      for (let i = 1; i <= 10; i++) {
        setBusy(`Minted — waiting for Wirex to see it (${i}/10)…`)
        await sleep(6_000)
        setWirexWallet(await getWirexWallet(user.user_address))
      }
    })

  const disabled = Boolean(busy)

  return (
    <>
      <Header text='Wirex (dev)' back />
      <Content>
        <Padded>
          <FlexCol gap='1.25rem'>
            {busy ? <TextSecondary>{busy}</TextSecondary> : null}
            <ErrorMessage error={Boolean(error)} text={error} />

            {!user ? (
              <>
                <FlexCol gap='0.5rem'>
                  <Text bold>Wallet password</Text>
                  {wallet.lockedByBiometrics ? (
                    <TextSecondary>You'll be asked for biometrics.</TextSecondary>
                  ) : (
                    <InputPassword
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder='Leave empty if the wallet has no password'
                    />
                  )}
                  <Button label='Load existing account' onClick={loadAccount} disabled={disabled} secondary />
                </FlexCol>

                <FlexCol gap='0.5rem'>
                  <Text bold>Register</Text>
                  <Input label='Email' value={email} onChange={(value: string) => setEmail(value)} />
                  <Input
                    label='Residence country (2-letter code, cannot be changed later)'
                    placeholder='GB'
                    maxLength={2}
                    value={country}
                    onChange={(value: string) => setCountry(value.toUpperCase())}
                  />
                  <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input type='checkbox' checked={isPep} onChange={(e) => setIsPep(e.target.checked)} />
                    <Text>I am a politically exposed person (PEP)</Text>
                  </label>
                  <Button
                    label='Register'
                    onClick={register}
                    disabled={disabled || !email.trim() || country.length !== 2}
                  />
                </FlexCol>
              </>
            ) : (
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
                  <Text bold>Wallet balances</Text>
                  {wirexWallet ? (
                    <>
                      <TextSecondary wrap>Wallet: {wirexWallet.wallet_address}</TextSecondary>
                      {(wirexWallet.balances ?? []).map((b) => (
                        <TextSecondary key={b.token_address} wrap>
                          {b.token_symbol}: {b.balance}
                        </TextSecondary>
                      ))}
                    </>
                  ) : null}
                  {signerBalances.length ? (
                    <>
                      <TextSecondary wrap>Signer (withdrawal destination): {user.user_address}</TextSecondary>
                      {signerBalances.map((b) => (
                        <TextSecondary key={b.symbol}>
                          {b.symbol}: {b.balance}
                        </TextSecondary>
                      ))}
                    </>
                  ) : null}
                  <Button label='Load wallet' onClick={loadWallet} disabled={disabled} secondary />
                  {isSandbox ? (
                    <Button label='Mint 100 test USDT (sandbox)' onClick={mintTestUsdt} disabled={disabled} />
                  ) : null}
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
            )}
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
