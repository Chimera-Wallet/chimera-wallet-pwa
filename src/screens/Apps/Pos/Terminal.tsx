/**
 * POS main page: type an amount (in fiat, BTC or sats), optionally add a note,
 * pick Arkade or Lightning and confirm to show the customer a QR code.
 *
 * The fiat value is fixed here, at the moment the sale is created.
 */

import { useContext, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import FlexCol from '../../../components/FlexCol'
import FlexRow from '../../../components/FlexRow'
import Header from '../../../components/Header'
import Input from '../../../components/Input'
import SegmentedControl from '../../../components/SegmentedControl'
import SheetModal from '../../../components/SheetModal'
import Text from '../../../components/Text'
import SettingsIcon from '../../../icons/Settings'
import CurrencySwapIcon from '../../../icons/CurrencySwap'
import NotesIcon from '../../../icons/Notes'
import TransactionsIcon from '../../../icons/Transactions'
import { useBankTransferValidation } from '../../../hooks/useBankTransferValidation'
import { fromSatoshis, prettyFiatAmount, prettyNumber, toSatoshis } from '../../../lib/format'
import { applyKeypadKey, type KeypadKey } from '../../../lib/keypad'
import {
  createPosPayment,
  getPosSettings,
  isFiatPayout,
  isFiatUnit,
  isPayoutConfigured,
  POS_METHODS,
  posInputUnits,
  posUnitDecimals,
  updatePosSettings,
  type PosMethod,
} from '../../../lib/pos'
import type { Fiats } from '../../../lib/types'
import { ConfigContext } from '../../../providers/config'
import { FiatContext } from '../../../providers/fiat'
import { NavigationContext, Pages } from '../../../providers/navigation'
import Keypad from './Keypad'
import { btcAmount, methodName } from './shared'

const roundTo = (n: number, decimals: number) => Math.round(n * 10 ** decimals) / 10 ** decimals

const chipStyle: React.CSSProperties = {
  alignItems: 'center',
  background: 'var(--surface)',
  border: 'none',
  borderRadius: '2rem',
  color: 'var(--fg)',
  cursor: 'pointer',
  display: 'inline-flex',
  fontSize: 13,
  gap: 6,
  maxWidth: '100%',
  padding: '0.4rem 0.85rem',
}

export default function PosTerminal() {
  const { t } = useTranslation()
  const { navigate } = useContext(NavigationContext)
  const { config } = useContext(ConfigContext)
  const { fromCurrency, toCurrency } = useContext(FiatContext)

  const settings = useMemo(getPosSettings, [])
  const units = posInputUnits(settings.payoutCurrency, config.fiat)
  const fiatPayout = isFiatPayout(settings.payoutCurrency) ? settings.payoutCurrency : undefined

  const [unit, setUnit] = useState<string>(
    settings.inputUnit && units.includes(settings.inputUnit) ? settings.inputUnit : units[0],
  )
  const [method, setMethod] = useState<PosMethod>(settings.method)
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [showNote, setShowNote] = useState(false)
  const [error, setError] = useState('')

  // ─── amount in every unit we need ───
  const toSats = (value: number, u: string): number => {
    if (u === 'SATS') return Math.round(value)
    if (u === 'BTC') return toSatoshis(value)
    return fromCurrency(value, u)
  }
  const fromSats = (sats: number, u: string): number => {
    if (u === 'SATS') return sats
    if (u === 'BTC') return fromSatoshis(sats)
    return toCurrency(sats, u)
  }

  const value = Number(text || '0')
  const sats = toSats(value, unit)
  // Fiat value recorded with the sale: the payout currency when converting,
  // otherwise whatever fiat the merchant typed (or their display fiat).
  const fiatCurrency = fiatPayout ?? (isFiatUnit(unit) ? unit : config.fiat)
  const fiatAmount = unit === fiatCurrency ? value : roundTo(fromSats(sats, fiatCurrency), posUnitDecimals(fiatCurrency))

  const validation = useBankTransferValidation({
    amount: fiatPayout ? fiatAmount : 0,
    currency: fiatPayout,
    circuit: settings.circuit,
    // only fiat payouts are bank withdrawals — skip the KYC lookup otherwise
    enabled: Boolean(fiatPayout),
  })

  const methodLabels = POS_METHODS.map((m) => t(methodName(m)))
  const primary = text || '0'
  const secondary = isFiatUnit(unit)
    ? `≈ ${btcAmount(sats)}`
    : `≈ ${prettyFiatAmount(fiatAmount, fiatCurrency as Fiats)}`

  const handleKey = (key: KeypadKey) => {
    setError('')
    setText((prev) => applyKeypadKey(prev, key, posUnitDecimals(unit)))
  }

  const switchUnit = () => {
    const next = units[(units.indexOf(unit) + 1) % units.length]
    const converted = sats ? fromSats(sats, next) : 0
    setText(converted ? prettyNumber(converted, posUnitDecimals(next), false) : '')
    setUnit(next)
    setError('')
  }

  const saveNote = () => {
    setNote(noteDraft)
    setShowNote(false)
  }

  const discard = () => {
    setText('')
    setNote('')
    setError('')
  }

  const confirm = () => {
    setError('')
    if (!isPayoutConfigured(settings)) {
      setError(t('apps.pos.terminal.setupPayout'))
      navigate(Pages.AppPosPayout)
      return
    }
    if (!value) return setError(t('apps.pos.terminal.enterAmount'))
    if (!sats) return setError(t('apps.pos.terminal.noRate'))
    // Fiat payouts must also be a valid bank withdrawal (minimum, KYC limit)
    if (fiatPayout && !validation.canProceed) return

    const payment = createPosPayment({
      note: note.trim(),
      method,
      sats,
      fiatAmount,
      fiatCurrency,
      payoutCurrency: settings.payoutCurrency,
    })
    updatePosSettings({ method, inputUnit: unit })
    discard()
    navigate(Pages.AppPosPayment, { paymentId: payment.id })
  }

  // Sized against the screen height so the amount, messages, keypad and
  // buttons all fit on a phone without anything being pushed out of view.
  const fontSize =
    primary.length <= 6 ? 'clamp(2.5rem, 9dvh, 4.5rem)' : primary.length <= 10 ? 'clamp(2rem, 6dvh, 3rem)' : '1.75rem'

  // One message at a time, shown right above the keypad where it can't be hidden
  const kycAction = fiatPayout && validation.kycRequired && !validation.kycVerified
  const message = error || (fiatPayout && value ? (validation.errorMessage ?? '') : '')

  return (
    <>
      <Header
        text={t('apps.pos.title')}
        back={() => navigate(Pages.Apps)}
        auxIcon={<SettingsIcon />}
        auxFunc={() => navigate(Pages.AppPosSettings)}
        auxAriaLabel={t('apps.pos.terminal.settings')}
      />
      <div
        style={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          gap: '0.5rem',
          justifyContent: 'space-between',
          minHeight: 0,
          overflowY: 'auto',
          padding: '0.25rem 1rem 0.5rem',
        }}
      >
        <SegmentedControl
          options={methodLabels}
          selected={t(methodName(method))}
          onChange={(label) => setMethod(POS_METHODS[methodLabels.indexOf(label)] ?? method)}
        />

        <div style={{ textAlign: 'center' }}>
          <div
            data-testid='pos-amount'
            style={{ fontFamily: 'Titillium Web', fontSize, fontWeight: 700, lineHeight: 1.1, wordBreak: 'break-all' }}
          >
            {primary}
          </div>
          <button
            type='button'
            onClick={switchUnit}
            aria-label={t('apps.pos.terminal.switchUnit')}
            data-testid='pos-unit'
            style={{ ...chipStyle, background: 'none', fontWeight: 600, fontSize: 14 }}
          >
            {unit}
            <CurrencySwapIcon />
          </button>
          <Text centered small color='neutral-500'>
            {secondary}
          </Text>
        </div>

        <FlexRow centered gap='0.5rem'>
          <button
            type='button'
            style={chipStyle}
            onClick={() => {
              setNoteDraft(note)
              setShowNote(true)
            }}
            data-testid='pos-note'
          >
            <NotesIcon small />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {note || t('apps.pos.terminal.addNote')}
            </span>
          </button>
          <button type='button' style={chipStyle} onClick={() => navigate(Pages.AppPosHistory)}>
            <TransactionsIcon />
            {t('apps.pos.terminal.history')}
          </button>
        </FlexRow>

        <div
          role='alert'
          data-testid='pos-message'
          style={{
            alignItems: 'center',
            color: 'var(--red-400)',
            display: 'flex',
            fontSize: 13,
            fontWeight: 600,
            gap: '0.5rem',
            justifyContent: 'center',
            lineHeight: 1.3,
            minHeight: '1.3em',
            textAlign: 'center',
          }}
        >
          {message}
          {message && kycAction ? (
            <button
              type='button'
              onClick={() => navigate(Pages.SettingsKYC)}
              style={{ ...chipStyle, flexShrink: 0, fontWeight: 600, padding: '0.25rem 0.75rem' }}
            >
              {t('apps.pos.payout.verify')}
            </button>
          ) : null}
        </div>
      </div>

      <Keypad onKey={handleKey} allowDecimal={posUnitDecimals(unit) > 0} />

      <ButtonsOnBottom>
        <FlexRow gap='0.5rem'>
          <Button
            label={t('apps.pos.terminal.confirm')}
            onClick={confirm}
            testId='pos-confirm'
            style={{ backgroundColor: 'var(--green-500)', borderColor: 'var(--green-500)', color: '#fff', minHeight: 52 }}
          />
          <Button
            label={t('apps.pos.terminal.discard')}
            onClick={discard}
            red
            testId='pos-discard'
            style={{ backgroundColor: 'var(--red-400)', borderColor: 'var(--red-400)', color: '#fff', minHeight: 52 }}
          />
        </FlexRow>
      </ButtonsOnBottom>

      <SheetModal isOpen={showNote} onClose={() => setShowNote(false)}>
        <FlexCol gap='1rem' padding='0.5rem 0'>
          <Text big bold>
            {t('apps.pos.terminal.note')}
          </Text>
          <Input
            focus
            maxLength={140}
            value={noteDraft}
            onChange={setNoteDraft}
            placeholder={t('apps.pos.terminal.notePlaceholder')}
            onEnter={saveNote}
            testId='pos-note-input'
          />
          <Button label={t('apps.pos.terminal.saveNote')} onClick={saveNote} />
          {note ? (
            <Button
              label={t('apps.pos.terminal.clearNote')}
              secondary
              onClick={() => {
                setNote('')
                setShowNote(false)
              }}
            />
          ) : null}
        </FlexCol>
      </SheetModal>
    </>
  )
}
