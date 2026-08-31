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
import InputAddress from '../../../components/InputAddress'
import Header from '../../../components/Header'
import { WalletContext } from '../../../providers/wallet'
import { prettyAmount, prettyNumber } from '../../../lib/format'
import Content from '../../../components/Content'
import FlexCol from '../../../components/FlexCol'
import FlexRow from '../../../components/FlexRow'
import Text from '../../../components/Text'
import InfoContainer from '../../../components/InfoContainer'
import Scanner from '../../../components/Scanner'
import Loading from '../../../components/Loading'
import { consoleError } from '../../../lib/logs'
import { Addresses, SettingsOptions } from '../../../lib/types'
import { getReceivingAddresses } from '../../../lib/asp'
import { OptionsContext } from '../../../providers/options'
import { ConfigContext } from '../../../providers/config'
import { FiatContext } from '../../../providers/fiat'
import { ArkNote, AssetDetails, isValidArkAddress, type NetworkName } from '@arkade-os/sdk'
import { LimitsContext } from '../../../providers/limits'
import { checkLnUrlConditions, fetchInvoice, fetchArkAddress, isValidLnUrl } from '../../../lib/lnurl'
import { extractError } from '../../../lib/error'
import { getInvoiceSatoshis } from '@arkade-os/boltz-swap'
import { SwapsContext } from '../../../providers/swaps'
import { decodeBip21, isBip21 } from '../../../lib/bip21'
import { FeesContext } from '../../../providers/fees'
import { InfoLine } from '../../../components/Info'
import { getNetworkConfig } from '../../../lib/networks'
import { getAssetConfig, requireAssetConfig, type AssetSymbol, unitsToCents } from '../../../lib/assets'
import { assetSupportsWrap, requireAssetChainOption, type SourceChainId } from '../../../lib/sourceChains'
import AssetSelector from '../../../components/AssetSelector'
import NetworkSelector from '../../../components/NetworkSelector'
import AssetNetworkSelector, { type AssetNetworkChoice } from '../../../components/AssetNetworkSelector'
import InlineAmountInput from '../../../components/InlineAmountInput'
import WhenIcon from '../../../icons/When'
import FeesIcon from '../../../icons/Fees'
import InfoIcon from '../../../icons/Info'
import { TERMS_AND_CONDITIONS, TRANSFER_METHOD, type InfoItemIcon } from '../../../lib/transferMethods'
import receiptIcon from '../../../../public/images/icons/ ReceiptReceipt.png'
import clockIcon from '../../../../public/images/icons/ Clock.svg'
import infoIcon from '../../../../public/images/icons/IconInfoIcon.png'
import checkMarkIcon from '../../../../public/images/icons/ CheckCheckMark.png'
import {useTranslation, Trans} from 'react-i18next'
import { decodeInvoice } from '../../../lib/bolt11'
import { lnSendRendezvous, requestLnSend } from '../../../lib/lnSwap'
import { withRfqTransport } from '../../../lib/nostrRfq'
import { getEmulatorPubkeyForNetwork, testDomains } from '../../../lib/constants'
import { discoverMarkets } from '../../../lib/swapMarkets'



export default function SendForm() {
  const { aspInfo } = useContext(AspContext)
  const { config, useFiat } = useContext(ConfigContext)
  const { calcOnchainOutputFee } = useContext(FeesContext)
  const { fromFiat, toFiat } = useContext(FiatContext)
  const { sendInfo, setNoteInfo, setSendInfo, setUnwrapSendInfo } = useContext(FlowContext)
  const { createSubmarineSwap, connected, calcSubmarineSwapFee, getApiUrl } = useContext(SwapsContext)
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
  const [nudgeBoltz, setNudgeBoltz] = useState(false)
  const [proceed, setProceed] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [recipient, setRecipient] = useState('')
  const [receivingAddresses, setReceivingAddresses] = useState<Addresses>()
  const [scan, setScan] = useState(false)
  const [tryingToSelfSend, setTryingToSelfSend] = useState(false)
  const { t } = useTranslation()

  // Asset and network can be changed, initialized from wallet flow or defaults
  const [selectedAsset, setSelectedAsset] = useState<AssetSymbol>('BTC')
  const selectedMethod: TransferMethod = sendInfo.method ?? TRANSFER_METHOD.bitcoin

  // Onchain sends deduct this fee from the amount (see SendDetails). If the
  // amount doesn't cover it, the send can't produce a positive output, so we
  // block it on the form rather than letting it fail at the sign step.
  const onchainOutputFee = calcOnchainOutputFee()
  const amountBelowOnchainFee = (sats?: number): boolean =>
    selectedMethod === TRANSFER_METHOD.bitcoin && Boolean(sats) && (sats as number) <= onchainOutputFee

  const smartSetError = (str: string) => {
    setError(str === '' ? (aspInfo.unreachable ? t('errors.send.arkade.server') : '') : str)
  }

  const setState = (info: SendInfo | ((prev: SendInfo) => SendInfo)) => {
    setScan(false)
    setSendInfo(info as any)
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
    const { recipient } = sendInfo
    setRecipient(recipient ?? '')
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
        const { address, arkAddress, invoice, lnUrl, satoshis, assetId, assetAmount } = decodeBip21(lowerCaseData)
        if (!address && !arkAddress && !invoice) return setError(t('errors.send.parsing.bip21'))
        if (selectedMethod === TRANSFER_METHOD.bitcoin) {
          if (!address) return setError(t('errors.send.bitcoin.address'))
          return setState({ ...sendInfo, address, arkAddress: '', invoice: '', lnUrl: undefined, recipient, satoshis })
        }
        if (selectedMethod === TRANSFER_METHOD.ark) {
          if (!arkAddress) return setError(t('errors.send.arkade.address'))
          return setState({ ...sendInfo, address: '', arkAddress, invoice: '', lnUrl: undefined, recipient, satoshis })
        }
        if (selectedMethod === TRANSFER_METHOD.lightning) {
          if (!invoice && !lnUrl) return setError(t('errors.send.lightning.address'))
          return setState((prev) => {
            const assets = assetId
              ? [{ assetId, amount: unitsToCents(assetAmount ?? '0') }]
              : undefined
            return {
              ...prev,
              address,
              arkAddress,
              invoice,
              recipient,
              satoshis: 0,
              assets,
              pendingLnSend: invoice === prev.invoice ? prev.pendingLnSend : undefined,
            }
          })
        }
        return setState({ address, arkAddress, invoice, recipient, satoshis })
      }
      if (isArkAddress(lowerCaseData)) {
        if (selectedMethod !== TRANSFER_METHOD.ark) {
          return setError(t('errors.send.arkade.type'))
        }
        return setState({ ...sendInfo, address: '', arkAddress: lowerCaseData, invoice: '', lnUrl: undefined })
      }
      if (isLightningInvoice(lowerCaseData)) {
        if (selectedMethod !== TRANSFER_METHOD.lightning) {
          return setError(t('errors.send.lightning.type'))
        }
        if (!connected) {
          setError(t('errors.send.lightning.swaps'))
          return setNudgeBoltz(true)
        }
        // Amount from the wallet's own decoder; expiry and chain are re-checked
        // by the RFQ client before any solver sees the invoice.
        let satoshis = 0
        try {
          satoshis = decodeInvoice(lowerCaseData).amountSats
        } catch {
          return setError('Unable to decode invoice')
        }
        if (!satoshis) return setError('Invoice must have amount defined')
        setState((prev) => ({
          ...prev,
          invoice: lowerCaseData,
          satoshis,
          pendingLnSend: lowerCaseData === prev.invoice ? prev.pendingLnSend : undefined,
        }))
        setAmount(satoshis)
        setAmountIsReadOnly(true)
        return
      }
      if (isBTCAddress(recipient)) {
        if (selectedMethod !== TRANSFER_METHOD.bitcoin) {
          return setError(t('errors.send.bitcoin.type'))
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
      setError(t('errors.send.parsing.recipientAddress'))
    }
    parseRecipient()
  }, [recipient, selectedMethod])

  // check lnurl limits
  useEffect(() => {
    const { satoshis } = sendInfo
    const { min, max } = lnUrlLimits
    if (!min || !max) return
    if (min > balance) return setError(t('errors.LNURL.funds'))
    if (satoshis && satoshis < min) return setError(t('errors.LNURL.below'))
    if (satoshis && satoshis > max) return setError(t('errors.LNURL.above'))
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
        if (!conditions) return setError(t('errors.LNURL.fetch'))
        const min = Math.floor(conditions.minSendable / 1000) // from millisatoshis to satoshis
        const max = Math.floor(conditions.maxSendable / 1000) // from millisatoshis to satoshis
        if (min === max) setSendInfo({ ...sendInfo, satoshis: min }) // set amount automatically
        return setLnUrlLimits({ min, max })
      })
      .catch(() => setError(t('errors.LNURL.address')))
  }, [sendInfo.lnUrl])

  // validate recipient addresses
  useEffect(() => {
    if (!receivingAddresses) return
    const { boardingAddr, offchainAddr } = receivingAddresses
    const { address, arkAddress, invoice } = sendInfo
    // check server limits for onchain transactions
    if (address && !arkAddress && !invoice && !utxoTxsAllowed()) {
      return setError(t('errors.send.chain.on'))
    }
    // check server limits for offchain transactions
    if (!address && (arkAddress || invoice) && !vtxoTxsAllowed()) {
      return setError(t('errors.send.chain.off'))
    }
    // check if server key is valid
    if (arkAddress && arkAddress.length > 0) {
      const { serverPubKey } = decodeArkAddress(arkAddress)
      const { serverPubKey: expectedServerPubKey } = decodeArkAddress(offchainAddr)
      if (serverPubKey !== expectedServerPubKey) {
        // if there's no other way to pay, show error
        if (!address && !invoice) return setError(t('errors.send.arkade.serverKeyMiss'))
        // remove ark address from possibilities to send and continue
        // we will try to pay to lightning or mainnet instead
        setSendInfo({ ...sendInfo, arkAddress: '' })
      }
    }
    // check if is trying to self send
    if (address === boardingAddr || arkAddress === offchainAddr) {
      setTryingToSelfSend(true) // nudge user to rollover
      return setError(t('errors.send.chain.self'))
    }
    // everything is ok, clean error
    setError('')
  }, [receivingAddresses, sendInfo.address, sendInfo.arkAddress, sendInfo.invoice])

  // manage button label and errors
  useEffect(() => {
    if (selectedMethod === TRANSFER_METHOD.bank) {
      setLabel(t('common.transfer'))
      return
    }
    const satoshis = sendInfo.satoshis ?? 0
    setLabel(t(
      satoshis > availableBalance
        ? 'errors.funds.insufficient'
        : lnUrlLimits.min && satoshis < lnUrlLimits.min
          ? 'errors.LNURL.below'
          : lnUrlLimits.max && satoshis > lnUrlLimits.max
            ? 'errors.LNURL.above'
            : satoshis && satoshis < 1
              ? 'errors.satoshi.minimum'
              : amountIsAboveMaxLimit(satoshis)
                ? 'errors.satoshi.minLimit'
                : satoshis && amountIsBelowMinLimit(satoshis)
                  ? 'errors.satoshi.maxLimit'
                  : amountBelowOnchainFee(satoshis)
                    ? 'errors.network.below'
                    : 'common.confirmSend')
    )
  }, [sendInfo.satoshis, availableBalance, selectedMethod, onchainOutputFee])

  // manage server unreachable error
  useEffect(() => {
    const errTxt = 'errors.send.arkade.server'
    if (!aspInfo.unreachable) {
      setError((prev) => (prev === errTxt ? '' : prev))
      return
    }
    setError(errTxt)
    setLabel(t('errors.general.server'))
  }, [aspInfo.unreachable])

    // proceed to next step
  useEffect(() => {
    const lowerCaseData = recipient.toLowerCase().replace(/^lightning:/, '')

    if (!proceed) return
    if (!sendInfo.address && !sendInfo.arkAddress && !sendInfo.invoice) return
    if (!sendInfo.arkAddress && sendInfo.invoice && !sendInfo.pendingLnSend && isLightningInvoice(lowerCaseData)) {
      // RFQ Lightning send: negotiate a quote over Nostr, derive the covenant
      // locally, verify, and carry the address+amount to the pay screen. The
      // negotiation is the only interactive step — funding IS acceptance.
      // This is the primary Lightning-send path; the legacy Boltz submarine
      // swap below only runs for invoices this branch's guard excludes, and
      // is otherwise superseded now that RFQ is in place.
      const negotiate = async () => {
        if (!svcWallet) return handleError('Wallet not ready')
        const network = aspInfo.network as NetworkName
        // No emulator URL is looked up here: this corridor needs the co-signer's
        // x-only KEY, never an endpoint. It rides the solver's own card; the
        // per-network pin is passed as the fallback for cards that predate the
        // field (see lnSendRendezvous). Neither available yields no rendezvous,
        // which the line below already reports.
        const rendezvous = lnSendRendezvous(await discoverMarkets(network), getEmulatorPubkeyForNetwork(network))
        if (!rendezvous) return handleError('No Lightning solver available')
        const sats = sendInfo.satoshis ?? 0
        if (sats < rendezvous.minSats || sats > rendezvous.maxSats) {
          return handleError(
            `Amount outside solver bounds (${prettyNumber(rendezvous.minSats)}-${prettyNumber(rendezvous.maxSats)} sats)`,
          )
        }
        await withRfqTransport(rendezvous, async (transport) => {
          const pendingLnSend = await requestLnSend({
            wallet: svcWallet,
            arkServerUrl: aspInfo.url,
            transport,
            invoice: sendInfo.invoice!,
            network,
            rendezvous,
          })
          setSendInfo((prev) => ({ ...prev, pendingLnSend }))
        })
      }
      negotiate().catch(handleError)
    } else if (!sendInfo.arkAddress && sendInfo.invoice && !sendInfo.pendingLnSend && !sendInfo.pendingSwap) {
      createSubmarineSwap(sendInfo.invoice)
        .then((pendingSwap) => {
          if (!pendingSwap) return setError(t('errors.general.swap'))
          setState({ ...sendInfo, pendingSwap })
        })
        .catch(handleError)
    } else navigate(Pages.SendDetails)
  }, [proceed, sendInfo.address, sendInfo.arkAddress, sendInfo.invoice, sendInfo.pendingSwap, sendInfo.pendingLnSend])

  // deal with fees deduction from amount
  useEffect(() => {
    if (!sendInfo.address || sendInfo.arkAddress || sendInfo.invoice) {
      setDeductFromAmount(false)
      return
    }
    const satoshis = sendInfo.satoshis ?? 0
    setDeductFromAmount(satoshis + calcOnchainOutputFee() > availableBalance)
  }, [availableBalance, sendInfo.satoshis, sendInfo.address, sendInfo.arkAddress, sendInfo.invoice])

  if (!svcWallet) return <Loading text={t('common.general.loading')} />

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
    setState({ ...sendInfo, satoshis: sats })
    setAmount(sats)
  }

  const handlePercentage = (percent: number) => {
    const amountInSats = Math.floor(availableBalance * (percent / 100))
    setState({ ...sendInfo, satoshis: amountInSats })
    setAmount(amountInSats)
  }

  const handleRecipientChange = (recipient: string) => {
    setState({ ...sendInfo, recipient })
    setRecipient(recipient)
  }

  const handleContinue = async () => {
    setProcessing(true)
    try {
      if (selectedMethod === TRANSFER_METHOD.bank) {
        handleError(t('errors.send.bank.transfer'))
        return
      }
      if (sendInfo.lnUrl) {
        if (selectedMethod === TRANSFER_METHOD.bitcoin) {
          handleError(t('errors.send.bitcoin.lnurl'))
          return
        }
        const conditions = await checkLnUrlConditions(sendInfo.lnUrl)
        const arkMethod = conditions.transferAmounts?.find((method) => method.method === 'Ark' && method.available)

        if (selectedMethod === TRANSFER_METHOD.ark) {
          if (!arkMethod) {
            handleError(t('errors.send.arkade.lnurl'))
            return
          }
          const arkResponse = await fetchArkAddress(sendInfo.lnUrl)
          if (!isArkAddress(arkResponse.address)) {
          handleError(t('errors.send.arkade.addressReceiveLnurl'))
            return
          }
          setState({ ...sendInfo, arkAddress: arkResponse.address, invoice: undefined })
        } else if (selectedMethod === TRANSFER_METHOD.lightning) {
          const invoice = await fetchInvoice(sendInfo.lnUrl, sendInfo.satoshis ?? 0, '')
          setState((prev) => ({
            ...prev,
            arkAddress: undefined,
            invoice,
            pendingLnSend: invoice === prev.invoice ? prev.pendingLnSend : undefined,
          }))
        }
      } else if (deductFromAmount) {
        const fee = calcOnchainOutputFee()
        const spendable = availableBalance - fee
        if (spendable <= 0) {
          handleError(t('errors.funds.insufficientFees'))
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

  const { address, arkAddress, lnUrl, invoice, satoshis } = sendInfo

  const resolvedMethod = selectedMethod

  const methodFee = (() => {
    if (!satoshis) return undefined
    if (resolvedMethod === TRANSFER_METHOD.lightning) return calcSubmarineSwapFee(satoshis) 
    if (resolvedMethod === TRANSFER_METHOD.bitcoin) return calcOnchainOutputFee()
    if (resolvedMethod === TRANSFER_METHOD.ark) return 0
    return undefined
  })()

  const methodFeeText = methodFee !== undefined ? (t('common.estimateFees') + ` ${prettyAmount(methodFee)}`) : ''

  // Get T&Cs for current method
  const termsAndConditions = TERMS_AND_CONDITIONS.send[resolvedMethod]

  // Helper to get icon component
  const getIconComponent = (iconType?: InfoItemIcon) => {
    switch (iconType) {
      case 'time':
        return <WhenIcon />
      case 'fees':
        return <FeesIcon />
      case 'warning':
        return undefined
      case 'instruction':
        return undefined
      case 'info':
        return <img src = {infoIcon} alt = 'info' style = {{width: '16px', height: '16px', filter: 'brightness(0) invert(0.7)'}} />
      case 'receipt': 
        return <img src = {receiptIcon} alt = 'receipt' style = {{width: '16px', height: '16px', filter: 'brightness(0) invert(0.7)'}} /> 
      case 'clock':
        return <img src = {clockIcon} alt = 'clock' style = {{width: '16px', height: '16px',filter: 'brightness(0) invert(0.7)'}} /> 
      default:
        return <InfoIcon />
    }
  }

  const buttonDisabled =
    selectedMethod === TRANSFER_METHOD.bank ||
    !((address || arkAddress || lnUrl || invoice) && satoshis && satoshis > 0) ||
    (lnUrlLimits.max && satoshis > lnUrlLimits.max) ||
    (lnUrlLimits.min && satoshis < lnUrlLimits.min) ||
    amountIsAboveMaxLimit(satoshis) ||
    amountIsBelowMinLimit(satoshis) ||
    amountBelowOnchainFee(satoshis) ||
    satoshis > availableBalance ||
    aspInfo.unreachable ||
    tryingToSelfSend ||
    Boolean(error) ||
    satoshis < 1 ||
    processing

  if (scan) {
    return (
      <Scanner close={() => setScan(false)} label={t('common.general.recipAddress')} onData={setRecipient} onError={smartSetError} />
    )
  }

  const selectedAssetBalanceSats = selectedAsset === 'BTC' ? availableBalance : undefined

  return (
    <>
      <Header text='' back />
      <Content>
        <Padded>
          <FlexCol gap='2rem'>
            <ErrorMessage error={Boolean(error)} text={error} />

            {/* Amount Input - Hidden for Lightning since amount is in invoice */}
            {selectedMethod !== TRANSFER_METHOD.lightning ? (
              <>
                <InlineAmountInput
                  value={amount || 0}
                  onChange={(newAmount) => handleAmountChange(newAmount)}
                  asset={selectedAsset}
                  disabled={amountIsReadOnly}
                />
                <div style={{ display: 'flex', justifyContent: 'center' , width: '100%', marginTop: '-1rem' }}>
                  <div style={{ width: '200px' }}>
                   <AssetSelector label='' selected={selectedAsset} onSelect={setSelectedAsset} selectedBalance = {selectedAssetBalanceSats}
                     style = {{
                     justifyContent: 'center',
                     width: '235px',
                     height: '36px',
                     borderRadius : '2.5rem',
                     fontSize: '14px',
                     fontWeight: '600',
                     padding: '1.3rem',
                     }} />
                  </div>
                </div>

                {/* Percentage Buttons */}
                {!amountIsReadOnly && availableBalance > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginTop: '-1rem' }}>
                    <FlexRow centered gap='0.7rem'>
                      {[25, 50, 75, 100].map((percent) => (
                        <button
                          key={percent}
                          onClick={() => handlePercentage(percent)}
                          style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--neutral-100)',
                            borderRadius: '0.5rem',
                            color: 'var(--neutral-700)',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            padding: '0.5rem 1rem',
                            transition: 'all 0.2s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--neutral-100)'
                            e.currentTarget.style.color = 'var(--black)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--surface)'
                            e.currentTarget.style.color = 'var(--neutral-700)'
                          }}
                        >
                          {percent}%
                        </button>
                      ))}
                    </FlexRow>
                  </div>
                ) : null}
              </>
            ) : null}

            {/* Lightning Invoice Details */}
            {selectedMethod === TRANSFER_METHOD.lightning && invoice && satoshis ? (
              <div
                style={{
                  background: 'var(--dark20)',
                  border: '1px solid var(--dark50)',
                  borderRadius: '0.75rem',
                  padding: '1rem',
                }}
              >
                <Text small color='var(--white70)'>
                  {t('common.notifications.send.invoiceDeets')}
                </Text>
                <FlexCol gap='0.5rem'>
                  <FlexRow between gap='0.5rem'>
                    <Text small color='var(--white50)'>
                      {t('common.general.amount')}
                    </Text>
                    <Text small bold>
                      {prettyAmount(satoshis)}
                    </Text>
                  </FlexRow>
                </FlexCol>
              </div>
            ) : null}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100', gap:'1rem'}}>
            {assetSupportsWrap(requireAssetConfig(selectedAsset).symbol) ? (
              <AssetNetworkSelector
                assetSymbol={requireAssetConfig(selectedAsset).symbol}
                mode='send'
                label=''
                selected={
                  selectedMethod === TRANSFER_METHOD.bank
                    ? 'bank'
                    : (selectedMethod as AssetNetworkChoice)
                }
                onSelect={(choice) => {
                  if (choice === TRANSFER_METHOD.bank) {
                    setSendInfo({ ...sendInfo, method: TRANSFER_METHOD.bank })
                    navigate(Pages.BankSend)
                    return
                  }
                  if (choice === TRANSFER_METHOD.ark) {
                    setRecipient('')
                    setSendInfo({
                      ...sendInfo,
                      method: TRANSFER_METHOD.ark,
                      address: '',
                      arkAddress: '',
                      invoice: '',
                      lnUrl: undefined,
                      pendingSwap: undefined,
                      recipient: '',
                    })
                    return
                  }
                  // Native destination chain selected -> Arkade Unwrap flow
                  const symbol = requireAssetConfig(selectedAsset).symbol
                  const option = requireAssetChainOption(symbol, choice as SourceChainId)
                  setUnwrapSendInfo({
                    assetSymbol: symbol,
                    chainId: choice as SourceChainId,
                    ticker: option.ticker,
                    sender: '',
                    receiver: '',
                  })
                  navigate(Pages.UnwrapSend)
                }}
                style={{ borderRadius: '2.5rem' }}
              />
            ) : (
            <NetworkSelector
              assetSymbol={requireAssetConfig(selectedAsset).symbol}
              label=''
              selected={selectedMethod}
              onSelect={(network) => {
                // Navigate to bank send screen if bank is selected
                if (network === TRANSFER_METHOD.bank) {
                  setSendInfo({ ...sendInfo, method: TRANSFER_METHOD.bank })
                  navigate(Pages.BankSend)
                  return
                }
                setRecipient('')
                setSendInfo({
                  ...sendInfo,
                  method: network,
                  address: '',
                  arkAddress: '',
                  invoice: '',
                  lnUrl: undefined,
                  pendingSwap: undefined,
                  recipient: '',
                })
              }}
              style = {{
                borderRadius : '2.5rem',
              }}
              
            />
            )}
            <InputAddress
              name='send-address'
              focus={focus === 'recipient'}
              label=''
              placeholder={t(getNetworkConfig(selectedMethod)?.addressPlaceholder ?? 'placeholders.addressFallback') || 'Paste address'}
              onChange={handleRecipientChange}
              onEnter={handleEnter}
              openAddressBook={() => navigate(Pages.AppAddressBook, { selectionMode: true, returnTo: Pages.SendForm })}
              openScan={() => setScan(true)}
              value={recipient}
            />
            
            <InfoContainer>
              {' '}
              {selectedMethod === TRANSFER_METHOD.lightning && !invoice ? (
                <InfoLine
                  compact
                  color='neutral'
                  icon={getIconComponent('info')}
                  text= {t('placeholders.lightning.invoice')}
                />
              ) : null}{' '}
              {termsAndConditions.map((item) => (
                <InfoLine
                  key={item.text}
                  compact
                  color={item.color}
                  icon={getIconComponent(item.icon)}
                  text={t(item.text)}
                />
              ))}
              {methodFeeText ? <InfoLine compact color='orange' icon={getIconComponent('receipt')} text={methodFeeText} /> : null}
              {deductFromAmount ? (
                <InfoLine compact color='orange' text={t('common.notifications.send.feesDeduction')}/>
              ) : null}
            </InfoContainer>
            </div>
            {tryingToSelfSend ? (
              <div style={{ width: '100%' }}>
                <Text centered small>
                  <Trans
                  i18nKey="common.notifications.send.rollOverVTXO"
                  components={[
                    <a onClick={gotoRollover} />
                  ]}
                />
                </Text>
              </div>
            ) : null}
            {nudgeBoltz && getApiUrl() ? (
              <div style={{ width: '100%' }}>
                <Text centered small>
                  <Trans
                    i18nKey="common.notifications.send.lightningSwaps"
                    components={{
                      link: <a onClick={gotoBoltzApp} />
                    }}
                  />
                </Text>
              </div>
            ) : null}
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button onClick={handleContinue} label={label} icon={<img src = {checkMarkIcon} alt = 'checkMark' style = {{width: '16px', height: '16px', filter: 'brightness(0) invert(-1)', marginLeft: '0.5rem'}} />} disabled={buttonDisabled}
        style = {{ margin: '4px 0', fontFamily: 'Titillium Web', fontStyle:'semibold', fontWeight : 600, width: '100%', height: '48px', borderRadius: '16px', color:'rgba(16,16,21,1)' ,backgroundColor : 'rgba(255,255,255,0.5)'}} />
      </ButtonsOnBottom>
    </>
  )
}
