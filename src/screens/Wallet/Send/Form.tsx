import { useContext, useEffect, useState } from 'react'
import Button from '../../../components/Button'
import ErrorMessage from '../../../components/Error'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { FlowContext, SendInfo, TransferMethod } from '../../../providers/flow'
import Padded from '../../../components/Padded'
import {
  isArkAddress,
  isBTCAddress,
  decodeArkAddress,
  isLightningInvoice,
  isURLWithLightningQueryString,
} from '../../../lib/address'
import { AspContext } from '../../../providers/asp'
import { isArkNote } from '../../../lib/arknote'
import InputAmount from '../../../components/InputAmount'
import InputAddress from '../../../components/InputAddress'
import Header from '../../../components/Header'
import { WalletContext } from '../../../providers/wallet'
import { prettyAmount, prettyNumber } from '../../../lib/format'
import Content from '../../../components/Content'
import FlexCol from '../../../components/FlexCol'
import Keyboard from '../../../components/Keyboard'
import Text from '../../../components/Text'
import InfoContainer from '../../../components/InfoContainer'
import Scanner from '../../../components/Scanner'
import Loading from '../../../components/Loading'
import { consoleError } from '../../../lib/logs'
import { Addresses, SettingsOptions } from '../../../lib/types'
import { getReceivingAddresses } from '../../../lib/asp'
import { OptionsContext } from '../../../providers/options'
import { isMobileBrowser } from '../../../lib/browser'
import { ConfigContext } from '../../../providers/config'
import { FiatContext } from '../../../providers/fiat'
import { ArkNote } from '@arkade-os/sdk'
import { LimitsContext } from '../../../providers/limits'
import { checkLnUrlConditions, fetchInvoice, fetchArkAddress, isValidLnUrl } from '../../../lib/lnurl'
import { extractError } from '../../../lib/error'
import { getInvoiceSatoshis } from '@arkade-os/boltz-swap'
import { LightningContext } from '../../../providers/lightning'
import { decodeBip21, isBip21 } from '../../../lib/bip21'
import { FeesContext } from '../../../providers/fees'
import { InfoLine } from '../../../components/Info'
import { getNetworkConfig } from '../../../lib/networks'
import { ASSETS, type AssetSymbol } from '../../../lib/assets'
import AssetIcon from '../../../icons/AssetIcon'
import WhenIcon from '../../../icons/When'
import FeesIcon from '../../../icons/Fees'
import {
  TRANSFER_METHOD,
  TRANSFER_METHOD_LABELS,
  SEND_METHOD_FEES_TEXT,
  SEND_METHOD_TIME_TEXT,
  SEND_METHOD_WARNING_TEXT,
} from '../../../lib/transferMethods'

export default function SendForm() {
  const { aspInfo } = useContext(AspContext)
  const { config, useFiat } = useContext(ConfigContext)
  const { calcOnchainOutputFee } = useContext(FeesContext)
  const { fromFiat, toFiat } = useContext(FiatContext)
  const { sendInfo, setNoteInfo, setSendInfo } = useContext(FlowContext)
  const { createSubmarineSwap, connected, calcSubmarineSwapFee, getApiUrl } = useContext(LightningContext)
  const { amountIsAboveMaxLimit, amountIsBelowMinLimit, utxoTxsAllowed, vtxoTxsAllowed } = useContext(LimitsContext)
  const { setOption } = useContext(OptionsContext)
  const { navigate } = useContext(NavigationContext)
  const { balance, svcWallet } = useContext(WalletContext)

  const [amount, setAmount] = useState<number>()
  const [amountIsReadOnly, setAmountIsReadOnly] = useState(false)
  const [availableBalance, setAvailableBalance] = useState(0)
  const [deductFromAmount, setDeductFromAmount] = useState(false)
  const [error, setError] = useState('')
  const [focus, setFocus] = useState('recipient')
  const [label, setLabel] = useState('')
  const [lnUrlLimits, setLnUrlLimits] = useState<{ min: number; max: number }>({ min: 0, max: 0 })
  const [keys, setKeys] = useState(false)
  const [nudgeBoltz, setNudgeBoltz] = useState(false)
  const [proceed, setProceed] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [recipient, setRecipient] = useState('')
  const [receivingAddresses, setReceivingAddresses] = useState<Addresses>()
  const [scan, setScan] = useState(false)
  const [textValue, setTextValue] = useState('')
  const [tryingToSelfSend, setTryingToSelfSend] = useState(false)

  // Asset and network are pre-selected by AssetNetworkSelect
  const selectedAsset: AssetSymbol = 'BTC' // For now only BTC is supported
  const selectedMethod: TransferMethod = sendInfo.method ?? TRANSFER_METHOD.bitcoin

  const smartSetError = (str: string) => {
    setError(str === '' ? (aspInfo.unreachable ? 'Ark server unreachable' : '') : str)
  }

  const setState = (info: SendInfo) => {
    setScan(false)
    setSendInfo(info)
  }

  // get receiving addresses
  useEffect(() => {
    if (!svcWallet) return
    getReceivingAddresses(svcWallet)
      .then(({ boardingAddr, offchainAddr }) => {
        if (!boardingAddr || !offchainAddr) {
          throw new Error('unable to get receiving addresses')
        }
        setReceivingAddresses({ boardingAddr, offchainAddr })
      })
      .catch(smartSetError)
  }, [])

  // update form with existing send info
  useEffect(() => {
    const { recipient, satoshis } = sendInfo
    setRecipient(recipient ?? '')
    if (!satoshis) return
    setTextValue(useFiat ? prettyNumber(fromFiat(satoshis)) : prettyNumber(satoshis, 0, false))
  }, [])

  // update available balance
  useEffect(() => {
    if (!svcWallet) return
    svcWallet
      .getBalance()
      .then((bal) => setAvailableBalance(bal.available))
      .catch(smartSetError)
  }, [balance])

  // parse recipient data
  useEffect(() => {
    smartSetError('')
    const parseRecipient = async () => {
      setNudgeBoltz(false)
      // Bank transfers are handled by a separate screen
      if (selectedMethod === TRANSFER_METHOD.bank) return
      if (!recipient) return
      const lowerCaseData = recipient.toLowerCase().replace(/^lightning:/, '')
      if (isURLWithLightningQueryString(recipient)) {
        const url = new URL(recipient)
        return setRecipient(url.searchParams.get('lightning')!)
      }
      if (isBip21(lowerCaseData)) {
        const { address, arkAddress, invoice, lnurl, satoshis } = decodeBip21(lowerCaseData)
        if (!address && !arkAddress && !invoice) return setError('Unable to parse bip21')
        if (selectedMethod === TRANSFER_METHOD.bitcoin) {
          if (!address) return setError('Selected method requires a Bitcoin address')
          return setState({ ...sendInfo, address, arkAddress: '', invoice: '', lnUrl: undefined, recipient, satoshis })
        }
        if (selectedMethod === TRANSFER_METHOD.ark) {
          if (!arkAddress) return setError('Selected method requires an Ark address')
          return setState({ ...sendInfo, address: '', arkAddress, invoice: '', lnUrl: undefined, recipient, satoshis })
        }
        if (selectedMethod === TRANSFER_METHOD.lightning) {
          if (!invoice && !lnurl) return setError('Selected method requires a Lightning invoice or LNURL')
          return setState({
            ...sendInfo,
            address: '',
            arkAddress: '',
            invoice: invoice ?? '',
            lnUrl: lnurl,
            recipient,
            satoshis,
          })
        }
        return setState({ address, arkAddress, invoice, recipient, satoshis })
      }
      if (isArkAddress(lowerCaseData)) {
        if (selectedMethod !== TRANSFER_METHOD.ark) {
          return setError('Selected method requires a different address type')
        }
        return setState({ ...sendInfo, address: '', arkAddress: lowerCaseData, invoice: '', lnUrl: undefined })
      }
      if (isLightningInvoice(lowerCaseData)) {
        if (selectedMethod !== TRANSFER_METHOD.lightning) {
          return setError('Selected method requires a different address type')
        }
        if (!connected) {
          setError('Lightning swaps not enabled')
          return setNudgeBoltz(true)
        }
        const satoshis = getInvoiceSatoshis(lowerCaseData)
        if (!satoshis) return setError('Invoice must have amount defined')
        setState({ ...sendInfo, address: '', arkAddress: '', invoice: lowerCaseData, lnUrl: undefined, satoshis })
        setAmountIsReadOnly(true)
        setAmount(satoshis)
        return
      }
      if (isBTCAddress(recipient)) {
        if (selectedMethod !== TRANSFER_METHOD.bitcoin) {
          return setError('Selected method requires a different address type')
        }
        return setState({ ...sendInfo, address: recipient, arkAddress: '', invoice: '', lnUrl: undefined })
      }
      if (isArkNote(lowerCaseData)) {
        try {
          const { value } = ArkNote.fromString(recipient)
          setNoteInfo({ note: recipient, satoshis: value })
          return navigate(Pages.NotesRedeem)
        } catch (err) {
          consoleError(err, 'error parsing ark note')
        }
      }
      if (isValidLnUrl(lowerCaseData)) {
        return setState({ ...sendInfo, address: '', arkAddress: '', invoice: '', lnUrl: lowerCaseData })
      }
      setError('Invalid recipient address')
    }
    parseRecipient()
  }, [recipient, selectedMethod])

  // check lnurl limits
  useEffect(() => {
    const { satoshis } = sendInfo
    const { min, max } = lnUrlLimits
    if (!min || !max) return
    if (min > balance) return setError('Insufficient funds for LNURL')
    if (satoshis && satoshis < min) return setError(`Amount below LNURL min limit`)
    if (satoshis && satoshis > max) return setError(`Amount above LNURL max limit`)
    if (min === max) {
      setAmount(useFiat ? toFiat(min) : min) // set fixed amount automatically
      setAmountIsReadOnly(true)
    } else {
      setAmountIsReadOnly(false)
    }
  }, [lnUrlLimits.min, lnUrlLimits.max])

  // check lnurl conditions
  useEffect(() => {
    if (!sendInfo.lnUrl) return
    if (sendInfo.lnUrl && sendInfo.invoice) return
    checkLnUrlConditions(sendInfo.lnUrl)
      .then((conditions) => {
        if (!conditions) return setError('Unable to fetch LNURL conditions')
        const min = Math.floor(conditions.minSendable / 1000) // from millisatoshis to satoshis
        const max = Math.floor(conditions.maxSendable / 1000) // from millisatoshis to satoshis
        if (min === max) setSendInfo({ ...sendInfo, satoshis: min }) // set amount automatically
        return setLnUrlLimits({ min, max })
      })
      .catch(() => setError('Invalid address or LNURL'))
  }, [sendInfo.lnUrl])

  // check if user wants to send all funds
  useEffect(() => {
    if (sendInfo.lnUrl && sendInfo.satoshis === balance) handleSendAll()
  }, [sendInfo.lnUrl])

  // validate recipient addresses
  useEffect(() => {
    if (!receivingAddresses) return
    const { boardingAddr, offchainAddr } = receivingAddresses
    const { address, arkAddress, invoice } = sendInfo
    // check server limits for onchain transactions
    if (address && !arkAddress && !invoice && !utxoTxsAllowed()) {
      return setError('Sending onchain not allowed')
    }
    // check server limits for offchain transactions
    if (!address && (arkAddress || invoice) && !vtxoTxsAllowed()) {
      return setError('Sending offchain not allowed')
    }
    // check if server key is valid
    if (arkAddress && arkAddress.length > 0) {
      const { serverPubKey } = decodeArkAddress(arkAddress)
      const { serverPubKey: expectedServerPubKey } = decodeArkAddress(offchainAddr)
      if (serverPubKey !== expectedServerPubKey) {
        // if there's no other way to pay, show error
        if (!address && !invoice) return setError('Ark server key mismatch')
        // remove ark address from possibilities to send and continue
        // we will try to pay to lightning or mainnet instead
        setSendInfo({ ...sendInfo, arkAddress: '' })
      }
    }
    // check if is trying to self send
    if (address === boardingAddr || arkAddress === offchainAddr) {
      setTryingToSelfSend(true) // nudge user to rollover
      return setError('Cannot send to yourself')
    }
    // everything is ok, clean error
    setError('')
  }, [receivingAddresses, sendInfo.address, sendInfo.arkAddress, sendInfo.invoice])

  // set text value from satoshis
  useEffect(() => {
    if (!sendInfo.satoshis) return
    const sats = sendInfo.satoshis
    const value = useFiat ? toFiat(sats) : sats
    const maximumFractionDigits = useFiat ? 2 : 0
    setTextValue(prettyNumber(value, maximumFractionDigits, false))
  }, [sendInfo.satoshis])

  // manage button label and errors
  useEffect(() => {
    if (selectedMethod === TRANSFER_METHOD.bank) {
      setLabel('Use Transfers')
      return
    }
    const satoshis = sendInfo.satoshis ?? 0
    setLabel(
      satoshis > availableBalance
        ? 'Insufficient funds'
        : lnUrlLimits.min && satoshis < lnUrlLimits.min
          ? 'Amount below LNURL min limit'
          : lnUrlLimits.max && satoshis > lnUrlLimits.max
            ? 'Amount above LNURL max limit'
            : satoshis && satoshis < 1
              ? 'Amount below 1 satoshi'
              : amountIsAboveMaxLimit(satoshis)
                ? 'Amount above max limit'
                : satoshis && amountIsBelowMinLimit(satoshis)
                  ? 'Amount below min limit'
                  : 'Continue',
    )
  }, [sendInfo.satoshis, availableBalance, selectedMethod])

  // manage server unreachable error
  useEffect(() => {
    const errTxt = 'Ark server unreachable'
    if (!aspInfo.unreachable) {
      setError((prev) => (prev === errTxt ? '' : prev))
      return
    }
    setError(errTxt)
    setLabel('Server unreachable')
  }, [aspInfo.unreachable])

  // proceed to next step
  useEffect(() => {
    if (!proceed) return
    if (!sendInfo.address && !sendInfo.arkAddress && !sendInfo.invoice) return
    if (!sendInfo.arkAddress && sendInfo.invoice && !sendInfo.pendingSwap) {
      createSubmarineSwap(sendInfo.invoice)
        .then((pendingSwap) => {
          if (!pendingSwap) return setError('Unable to create swap')
          setState({ ...sendInfo, pendingSwap })
        })
        .catch(handleError)
    } else navigate(Pages.SendDetails)
  }, [proceed, sendInfo.address, sendInfo.arkAddress, sendInfo.invoice, sendInfo.pendingSwap])

  // deal with fees deduction from amount
  useEffect(() => {
    if (!sendInfo.address || sendInfo.arkAddress || sendInfo.invoice) {
      setDeductFromAmount(false)
      return
    }
    const satoshis = sendInfo.satoshis ?? 0
    setDeductFromAmount(satoshis + calcOnchainOutputFee() > availableBalance)
  }, [availableBalance, sendInfo.satoshis, sendInfo.address, sendInfo.arkAddress, sendInfo.invoice])

  if (!svcWallet) return <Loading text='Loading...' />

  const gotoBoltzApp = () => {
    navigate(Pages.AppBoltzSettings)
  }

  const gotoRollover = () => {
    setOption(SettingsOptions.Vtxos)
    navigate(Pages.Settings)
  }

  const handleError = (err: any) => {
    consoleError(err, 'error sending payment')
    setError(extractError(err))
    setProcessing(false)
  }

  const handleAmountChange = (sats: number) => {
    setTextValue(useFiat ? prettyNumber(toFiat(sats), 2, false) : prettyNumber(sats, 0, false))
    setState({ ...sendInfo, satoshis: sats })
    setAmount(sats)
  }

  const handleRecipientChange = (recipient: string) => {
    setState({ ...sendInfo, recipient })
    setRecipient(recipient)
  }

  const handleContinue = async () => {
    setProcessing(true)
    try {
      if (selectedMethod === TRANSFER_METHOD.bank) {
        handleError('Bank transfers are handled in Transfers')
        return
      }
      if (sendInfo.lnUrl) {
        if (selectedMethod === TRANSFER_METHOD.bitcoin) {
          handleError('Selected method does not support LNURL')
          return
        }
        const conditions = await checkLnUrlConditions(sendInfo.lnUrl)
        const arkMethod = conditions.transferAmounts?.find((method) => method.method === 'Ark' && method.available)

        if (selectedMethod === TRANSFER_METHOD.ark) {
          if (!arkMethod) {
            handleError('LNURL does not support Ark payments')
            return
          }
          const arkResponse = await fetchArkAddress(sendInfo.lnUrl)
          if (!isArkAddress(arkResponse.address)) {
            handleError('Invalid Ark address received from LNURL')
            return
          }
          setState({ ...sendInfo, arkAddress: arkResponse.address, invoice: undefined })
        } else if (selectedMethod === TRANSFER_METHOD.lightning) {
          const invoice = await fetchInvoice(sendInfo.lnUrl, sendInfo.satoshis ?? 0, '')
          setState({ ...sendInfo, invoice, arkAddress: undefined })
        }
      } else if (deductFromAmount) {
        const fee = calcOnchainOutputFee()
        const spendable = availableBalance - fee
        if (spendable <= 0) {
          handleError('Insufficient funds to cover fees')
          return
        }
        setState({ ...sendInfo, satoshis: Math.min(sendInfo.satoshis ?? 0, spendable) })
      } else {
        setState({ ...sendInfo, satoshis: sendInfo.satoshis ?? 0 })
      }
      setProceed(true)
    } catch (error) {
      handleError(error)
    }
  }

  const handleEnter = () => {
    if (!buttonDisabled) return handleContinue()
    if (!amount && focus === 'recipient') setFocus('amount')
    if (!recipient && focus === 'amount') setFocus('recipient')
  }

  const handleFocus = () => {
    if (isMobileBrowser) setKeys(true)
  }

  const handleSendAll = () => {
    const fees = sendInfo.lnUrl ? (calcSubmarineSwapFee(availableBalance) ?? 0) : 0
    const amountInSats = availableBalance - fees
    const maximumFractionDigits = useFiat ? 2 : 0
    const value = useFiat ? toFiat(amountInSats) : amountInSats
    setTextValue(prettyNumber(value, maximumFractionDigits, false))
    setState({ ...sendInfo, satoshis: amountInSats })
    setAmount(amountInSats)
  }

  const Available = () => {
    const amount = useFiat ? toFiat(availableBalance) : availableBalance
    const pretty = useFiat ? prettyAmount(amount, config.fiat) : prettyAmount(amount)
    return (
      <div onClick={handleSendAll} style={{ cursor: 'pointer' }}>
        <Text smaller>
          {`${pretty} available`}
        </Text>
      </div>
    )
  }

  const { address, arkAddress, lnUrl, invoice, satoshis } = sendInfo

  const resolvedMethod = selectedMethod

  const methodFee = (() => {
    if (!satoshis) return undefined
    if (resolvedMethod === TRANSFER_METHOD.lightning) return calcSubmarineSwapFee(satoshis)
    if (resolvedMethod === TRANSFER_METHOD.bitcoin) return calcOnchainOutputFee()
    if (resolvedMethod === TRANSFER_METHOD.ark) return 0
    return undefined
  })()

  const methodFeeText = methodFee !== undefined ? `Estimated fees: ${prettyAmount(methodFee)}` : ''
  const methodTimeInfo = `Transfer time: ${SEND_METHOD_TIME_TEXT[resolvedMethod]}`
  const methodFeesInfo = `Fees: ${SEND_METHOD_FEES_TEXT[resolvedMethod]}`
  const methodWarningInfo = SEND_METHOD_WARNING_TEXT[resolvedMethod]

  const buttonDisabled =
    selectedMethod === TRANSFER_METHOD.bank ||
    !((address || arkAddress || lnUrl || invoice) && satoshis && satoshis > 0) ||
    (lnUrlLimits.max && satoshis > lnUrlLimits.max) ||
    (lnUrlLimits.min && satoshis < lnUrlLimits.min) ||
    amountIsAboveMaxLimit(satoshis) ||
    amountIsBelowMinLimit(satoshis) ||
    satoshis > availableBalance ||
    aspInfo.unreachable ||
    tryingToSelfSend ||
    Boolean(error) ||
    satoshis < 1 ||
    processing

  if (scan) {
    return (
      <Scanner close={() => setScan(false)} label='Recipient address' onData={setRecipient} onError={smartSetError} />
    )
  }

  return (
    <>
      <Header text='Send' back />
      <Content>
        <Padded>
          <FlexCol gap='2rem'>
            <ErrorMessage error={Boolean(error)} text={error} />
            {/* Inline Editable Amount Section */}
            <div style={{ textAlign: 'center', width: '100%', marginTop: '1rem' }}>
              <div style={{ marginBottom: '0.5rem', color: 'var(--white70)', fontSize: '0.875rem' }}>
                Amount
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <input
                  type="number"
                  value={amount ? amount / Math.pow(10, ASSETS[selectedAsset].precision) : ''}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '') {
                      setAmount(undefined)
                    } else {
                      const numValue = parseFloat(value)
                      if (!isNaN(numValue) && numValue >= 0) {
                        handleAmountChange(Math.floor(numValue * Math.pow(10, ASSETS[selectedAsset].precision)))
                      }
                    }
                  }}
                  placeholder="0"
                  disabled={amountIsReadOnly}
                  style={{
                    fontSize: '2.5rem',
                    fontWeight: 700,
                    color: 'white',
                    fontFamily: 'monospace',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    textAlign: 'center',
                    width: '12ch',
                    padding: '0.25rem',
                  }}
                />
                <span style={{ fontSize: '1.25rem', fontWeight: 600, color: 'white' }}>
                  {ASSETS[selectedAsset].symbol}
                </span>
              </div>
              {/* Fiat equivalent */}
              <div style={{ fontSize: '1rem', color: 'var(--white50)', marginTop: '0.25rem' }}>
                {prettyNumber(toFiat(amount || 0), 2)} {config.fiat}
              </div>
              {/* Network indicator (non-editable - set by AssetNetworkSelect) */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginTop: '1rem',
                padding: '0.5rem 1rem',
                borderRadius: '2rem',
                backgroundColor: 'var(--white05)',
              }}>
                <AssetIcon symbol={selectedAsset} size={20} />
                <span style={{ color: 'white', fontSize: '0.875rem' }}>
                  {ASSETS[selectedAsset].name} via {TRANSFER_METHOD_LABELS[selectedMethod] || selectedMethod}
                </span>
              </div>
            </div>
            <InputAddress
                name='send-address'
                focus={focus === 'recipient'}
                label='Recipient address'
                placeholder={getNetworkConfig(selectedMethod)?.addressPlaceholder || 'Paste address'}
                onChange={handleRecipientChange}
                onEnter={handleEnter}
                openAddressBook={() => navigate(Pages.AppAddressBook, { selectionMode: true, returnTo: Pages.SendForm })}
                openScan={() => {
                  setKeys(false)
                  setScan(true)
                }}
                value={recipient}
              />
            {Boolean(methodWarningInfo || methodFeeText || methodTimeInfo || methodFeesInfo || deductFromAmount) && (
              <InfoContainer>
                {methodWarningInfo ? <InfoLine compact color='orange' text={methodWarningInfo} /> : null}
                {methodFeeText ? <InfoLine compact color='orange' icon={<FeesIcon />} text={methodFeeText} /> : null}
                {methodTimeInfo ? <InfoLine compact icon={<WhenIcon />} text={methodTimeInfo} /> : null}
                {methodFeesInfo ? <InfoLine compact icon={<FeesIcon />} text={methodFeesInfo} /> : null}
                {deductFromAmount ? <InfoLine compact color='orange' text='Fees will be deducted from the amount sent' /> : null}
              </InfoContainer>
            )}
            {tryingToSelfSend ? (
              <div style={{ width: '100%' }}>
                <Text centered small>
                  Did you mean <a onClick={gotoRollover}>roll over your VTXOs</a>?
                </Text>
              </div>
            ) : null}
            {nudgeBoltz && getApiUrl() ? (
              <div style={{ width: '100%' }}>
                <Text centered small>
                  Enable <a onClick={gotoBoltzApp}>Lightning swaps</a> to pay
                </Text>
              </div>
            ) : null}
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button onClick={handleContinue} label={label} disabled={buttonDisabled} />
      </ButtonsOnBottom>
    </>
  )
}
