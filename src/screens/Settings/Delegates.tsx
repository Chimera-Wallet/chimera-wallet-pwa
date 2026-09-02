import Header from './Header'
import ArrowIcon from '../../icons/Arrow'
import { prettyAgo, prettyAmount, prettyLongText } from '../../lib/format'
import Button from '../../components/Button'
import Padded from '../../components/Padded'
import Content from '../../components/Content'
import FlexCol from '../../components/FlexCol'
import FlexRow from '../../components/FlexRow'
import { Switch } from '@/components/ui/switch'
import { AspContext, AspInfo } from '../../providers/asp'
import InfoIcon from '../../icons/Info'
import ResetIcon from '../../icons/Reset'
import { Delegate, SettingsOptions } from '../../lib/types'
import { ConfigContext } from '../../providers/config'
import { WalletContext } from '../../providers/wallet'
import { getDelegateUrl, isDelegationEnabled } from '../../lib/constants'
import { useContext, useEffect, useState } from 'react'
import { OptionsContext } from '../../providers/options'
import Text, { TextSecondary } from '../../components/Text'
import { decodeArkAddress, isArkAddress } from '../../lib/address'
import { copyToClipboard } from '../../lib/clipboard'
import { hapticLight } from '../../lib/haptics'
import { useToast } from '../../components/Toast'
import{useTranslation} from 'react-i18next'

const DOCS_URL = 'https://docs.arkadeos.com/learn/pillars/batch-expiry#delegation-solutions'

// Shared card shell for the four stacked panels on this screen.
const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--surface)',
  borderRadius: '1.25rem',
  padding: '1.25rem 1rem',
  width: '100%',
  boxSizing: 'border-box',
}

// Small uppercase metadata styling used for the renewal label, the status and
// the address/pubkey/fee lines.
const metaStyle: React.CSSProperties = {
  color: 'var(--neutral-500)',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.06em',
  lineHeight: 1.6,
  textTransform: 'uppercase',
  margin: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

// format the URL to ensure it has the correct protocol and no trailing slashes
const formatUrl = (host: string, path: string): string => {
  host = host.replace(/\/+$/, '')
  path = path.replace(/^\/+/, '')
  const prefix =
    host.startsWith('http://') || host.startsWith('https://')
      ? ''
      : host.startsWith('localhost') || host.startsWith('127.0.0.1')
        ? 'http://'
        : 'https://'
  return `${prefix}${host}/${path}`
}

// test connection to delegate by fetching delegate info and validating the response
const testConnection = (aspInfo: AspInfo, t: (k: string, o?: any) => string): Promise<Delegate> => {
  return new Promise((resolve, reject) => {
    // ensure expected pubkey is in xonly format
    const expectedPubKey = aspInfo.signerPubkey.length === 66 ? aspInfo.signerPubkey.slice(2) : aspInfo.signerPubkey
    if (expectedPubKey.length !== 64) return reject(new Error('Invalid expected server pubkey'))
    const delegate = getDelegateUrl()
    // fetch delegate info from the delegate server
    fetch(formatUrl(delegate.url, '/v1/delegator/info'))
      .then((res) => {
        if (!res.ok) return reject(new Error(t('errors.delegates.unableConnect')))
        res
          .json()
          .then((data: { delegatorAddress: string; pubkey: string; fee: string }) => {
            if (!data) return reject(new Error(t('errors.delegates.invalidResponse')))
            if (!data.fee) return reject(new Error(t('errors.delegates.missingFee')))
            if (isNaN(parseInt(data.fee, 10))) return reject(new Error(t('errors.delegates.invalidFee')))
            if (parseInt(data.fee, 10) < 0) return reject(new Error(t('errors.delegates.negativeFee')))
            if (!data.pubkey) return reject(new Error(t('errors.delegates.missingPubkey')))
            if (data.pubkey.length !== 66) return reject(new Error(t('errors.delegates.invalidPubkeySize')))
            if (!/^[0-9a-fA-F]{66}$/.test(data.pubkey)) return reject(new Error(t('errors.delegates.invalidPubkeyHex')))
            if (!data.delegatorAddress) return reject(new Error(t('errors.delegates.missingAddress')))
            if (!isArkAddress(data.delegatorAddress)) return reject(new Error(t('errors.delegates.invalidAddress')))
            const { serverPubKey } = decodeArkAddress(data.delegatorAddress)
            if (serverPubKey !== expectedPubKey) return reject(new Error(t('errors.delegates.invalidServerKey')))
            resolve({ ...delegate, address: data.delegatorAddress, pubkey: data.pubkey, fee: parseInt(data.fee, 10) })
          })
          .catch(() => reject(new Error(t('errors.delegates.invalidJSONResp'))))
      })
      .catch(() => reject(new Error(t('errors.delegates.unableConnect'))))
  })
}

// person-with-a-check glyph heading the explainer card
function DelegateIcon() {
  return (
    <svg width='34' height='34' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'>
      <circle cx='9' cy='7' r='3.25' stroke='currentColor' strokeWidth='1.6' />
      <path
        d='M2.75 19.25c0-3.31 2.8-5.5 6.25-5.5 1.2 0 2.32.27 3.28.74'
        stroke='currentColor'
        strokeWidth='1.6'
        strokeLinecap='round'
      />
      <path
        d='M15 16.9l1.9 1.9 3.6-3.9'
        stroke='currentColor'
        strokeWidth='1.6'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  )
}

// explainer card: icon, heading, blurb and a full-width call to action
function Hero() {
  const {t} = useTranslation()
  return (
    <div style={cardStyle}>
      <FlexCol gap='0.75rem'>
        <div style={{ width: '100%', display: 'flex', justifyContent: 'center', color: 'var(--fg)' }}>
          <DelegateIcon />
        </div>
        <Text bold centered large>
          {t('settings.delegates.whatIs')}
        </Text>
        <Text small thin wrap>
          {t('settings.delegates.delegateDescr')}
        </Text>
        <div style={{ width: '100%', paddingTop: '0.5rem' }}>
          <Button
            onClick={() => window.open(DOCS_URL, '_blank', 'noopener,noreferrer')}
            label={t('settings.delegates.learnMore')}
            style={{
              borderRadius: 999,
              boxShadow: 'none',
              minHeight: 56,
              fontFamily: 'Titillium Web',
              fontSize: 17,
              fontWeight: 600,
              letterSpacing: '0.06em',
            }}
          />
        </div>
      </FlexCol>
    </div>
  )
}

// the two cautions shown under the toggle, in one amber panel
function NoteBox() {
  const {t} = useTranslation()
  const color = 'var(--yellow)'
  const rows = [
    { icon: <ResetIcon />, text: t('settings.delegates.reloadWarn') },
    { icon: <InfoIcon />, text: t('settings.delegates.vtxoWarn') },
  ]
  return (
    <div
      style={{
        backgroundColor: 'color-mix(in srgb, var(--yellow-500) 22%, var(--bg))',
        borderRadius: '1.25rem',
        padding: '1.25rem 1rem',
        width: '100%',
        boxSizing: 'border-box',
        color,
      }}
    >
      <FlexCol gap='1.25rem'>
        {rows.map((row) => (
          <FlexRow key={row.text} alignItems='flex-start' gap='0.75rem'>
            <div style={{ color, flexShrink: 0, display: 'flex', paddingTop: 2 }}>{row.icon}</div>
            <Text small wrap>
              {row.text}
            </Text>
          </FlexRow>
        ))}
      </FlexCol>
    </div>
  )
}

// middle dot component to indicate status of delegate connection
function Middot({ ok = true }: { ok?: boolean }) {
  const color = ok ? 'var(--toggle-on)' : '#E27D60'
  return (
    <svg width='14' height='14' viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'>
      <rect width='14' height='14' rx='7' fill={color} fillOpacity='0.1' />
      <circle cx='7' cy='7' r='3' fill={color} />
    </svg>
  )
}

// card component to show current delegate information and status
function DelegateCard() {
  const { aspInfo } = useContext(AspContext)
  const { config } = useContext(ConfigContext)
  const { wallet } = useContext(WalletContext)
  const { setOption } = useContext(OptionsContext)

  const {t} = useTranslation()

  const { toast } = useToast()

  const [active, setActive] = useState(false)
  const [delegate, setDelegate] = useState<Delegate | undefined>(() =>
    isDelegationEnabled() ? getDelegateUrl() : undefined,
  )

  // test connection to delegate when url changes
  useEffect(() => {
    if (!config.delegate || !isDelegationEnabled()) return
    testConnection(aspInfo,t)
      .then((delegate) => {
        setDelegate(delegate)
        setActive(true)
      })
      .catch(() => setActive(false))
  }, [config.delegate, aspInfo.signerPubkey, t])

  if (!config.delegate || !isDelegationEnabled() || !delegate) return null

  const handleCopy = async (value: string) => {
    await copyToClipboard(value)
    toast(t('common.general.copyClipboard'))
  }

  const nextRolloverText = wallet.nextRollover
    ? t('settings.delegates.renewal',{time: prettyAgo(wallet.nextRollover)})
    : t('settings.delegates.noRenewal')

  return (
    <div style={cardStyle} data-testid='delegate-card'>
      <FlexCol gap='0.75rem'>
        <FlexRow between>
          <Text>{delegate.name}</Text>
          <FlexRow end gap='0.35rem' onClick={() => setOption(SettingsOptions.Vtxos)}>
            <p style={metaStyle}>{nextRolloverText}</p>
            <ArrowIcon small />
          </FlexRow>
        </FlexRow>
        <hr />
        <FlexRow between>
          <div
            style={{
              backgroundColor: 'var(--neutral-100)',
              borderRadius: 999,
              padding: '0.5rem 0.9rem',
              minWidth: 0,
            }}
          >
            <p style={{ ...metaStyle, color: 'var(--fg)' }}>{delegate.url}</p>
          </div>
          <FlexRow end gap='0.4rem'>
            <p style={metaStyle}>{active ? t('common.general.active') : t('common.general.inactive')}</p>
            <Middot ok={active} />
          </FlexRow>
        </FlexRow>
        <FlexCol gap='0'>
          <p style={metaStyle} onClick={() => handleCopy(delegate.address)}>
            address: {prettyLongText(delegate.address, 14)}
          </p>
          <p style={metaStyle} onClick={() => handleCopy(delegate.pubkey)}>
            pubkey: {prettyLongText(delegate.pubkey, 14)}
          </p>
          <p style={metaStyle} onClick={() => handleCopy(delegate.fee.toString())}>
            fee: {prettyAmount(delegate.fee)}
          </p>
        </FlexCol>
      </FlexCol>
    </div>
  )
}

export default function Delegates() {
  const {t} = useTranslation()
  const { goBack } = useContext(OptionsContext)
  const { config, updateConfig } = useContext(ConfigContext)

  // Delegation needs both VITE_DELEGATE_ENABLED and a VITE_DELEGATOR_URL for
  // this network. Without them the stored flag is forced back off on the next
  // boot (see the VITE_DELEGATE_ENABLED precedence rule in providers/config),
  // so an interactive switch would reload the app and silently revert.
  const delegationAvailable = isDelegationEnabled()

  // toggle delegate
  const handleToggle = () => {
    if (!delegationAvailable) return
    hapticLight()
    const nextDelegate = !config.delegate
    updateConfig({ ...config, delegate: nextDelegate })
    // Full page reload ensures service worker and wallet are re-instantiated with the new delegator setting.
    window.location.reload()
  }

  return (
    <>
      <Header backFunc={goBack} text={t('settings.delegates.delegates')} />
      <Content>
        <Padded>
          <FlexCol gap='1rem' padding='0 0 24px 0'>
            <Hero />
            <div style={{ ...cardStyle, borderRadius: '2rem', padding: '1.25rem 1.5rem' }}>
              <FlexCol gap='0.5rem'>
                <FlexRow between>
                  <Text large>{t('settings.delegates.defaultArk')}</Text>
                  <Switch
                    checked={Boolean(delegationAvailable && config.delegate)}
                    onCheckedChange={handleToggle}
                    disabled={!delegationAvailable}
                    data-testid='toggle-delegates'
                    data-checked={delegationAvailable && config.delegate ? 'true' : 'false'}
                    size='lg'
                    className='data-checked:bg-[var(--toggle-on)]'
                  />
                </FlexRow>
                {delegationAvailable ? null : (
                  <TextSecondary>{t('settings.delegates.unavailable')}</TextSecondary>
                )}
              </FlexCol>
            </div>
            <NoteBox />
            <DelegateCard />
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
