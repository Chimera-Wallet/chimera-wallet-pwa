import { useContext, useEffect, useRef, useState } from 'react'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import { FlowContext } from '../../../providers/flow'
import { NavigationContext, Pages } from '../../../providers/navigation'
import Padded from '../../../components/Padded'
import ErrorMessage from '../../../components/Error'
import { getReceivingAddresses } from '../../../lib/asp'
import { extractError } from '../../../lib/error'
import Header from '../../../components/Header'
import InfoContainer from '../../../components/InfoContainer'
import Content from '../../../components/Content'
import FlexCol from '../../../components/FlexCol'
import { WalletContext } from '../../../providers/wallet'
import { callFaucet, pingFaucet } from '../../../lib/faucet'
import Loading from '../../../components/Loading'
import { prettyAmount } from '../../../lib/format'
import Success from '../../../components/Success'
import { consoleError } from '../../../lib/logs'
import { AspContext } from '../../../providers/asp'
import { LimitsContext } from '../../../providers/limits'
import { InfoLine } from '../../../components/Info'
import QrCode from '../../../components/QrCode'
import ExpandAddresses from '../../../components/ExpandAddresses'
import { canBrowserShareData, shareData } from '../../../lib/share'
import { NotificationsContext } from '../../../providers/notifications'
import { encodeBip21 } from '../../../lib/bip21'
import { LnReceiveContext } from '../../../providers/lnReceive'
import WarningBox from '../../../components/Warning'
import { ASSETS, getAssetConfig, requireAssetConfig, type AssetSymbol } from '../../../lib/assets'
import { assetSupportsWrap, requireAssetChainOption, type SourceChainId } from '../../../lib/sourceChains'
import AssetSelector from '../../../components/AssetSelector'
import NetworkSelector from '../../../components/NetworkSelector'
import AssetNetworkSelector, { type AssetNetworkChoice } from '../../../components/AssetNetworkSelector'
import InlineAmountInput from '../../../components/InlineAmountInput'
import WhenIcon from '../../../icons/When'
import FeesIcon from '../../../icons/Fees'
import InfoIcon from '../../../icons/Info'
import {
  TERMS_AND_CONDITIONS,
  TRANSFER_METHOD,
  TRANSFER_METHOD_LABELS,
  type InfoItemIcon,
  type TransferMethod,
} from '../../../lib/transferMethods'
import receiptIcon from '../../../../public/images/icons/ ReceiptReceipt.png'
import clockIcon from '../../../../public/images/icons/ Clock.svg'
import infoIcon from '../../../../public/images/icons/IconInfoIcon.png'
import checkMarkIcon from '../../../../public/images/icons/ CheckCheckMark.png'
import {useTranslation} from 'react-i18next'

export default function ReceiveAmount() {
  const { aspInfo } = useContext(AspContext)
  const { recvInfo, setRecvInfo, setWrapRecvInfo } = useContext(FlowContext)
  const { navigate } = useContext(NavigationContext)
  const { notifyPaymentReceived } = useContext(NotificationsContext)
  const { validUtxoTx, validVtxoTx, utxoTxsAllowed, vtxoTxsAllowed } = useContext(LimitsContext)
  const { balance, svcWallet } = useContext(WalletContext)
  const { requestReceive } = useContext(LnReceiveContext)

  const [error, setError] = useState('')
  const [fauceting, setFauceting] = useState(false)
  const [faucetSuccess, setFaucetSuccess] = useState(false)
  const [faucetAvailable, setFaucetAvailable] = useState(false)
  const [satoshis, setSatoshis] = useState(0) // Amount for Lightning, 0 for flexible QR codes on other networks
  const [sharing, setSharing] = useState(false)
  const [invoice, setInvoice] = useState(recvInfo.invoice ?? '')
  const [qrValue, setQrValue] = useState('')
  const [bip21uri, setBip21uri] = useState('')
  const [showQrCode, setShowQrCode] = useState(false)
  const [lnReceiveError, setLnReceiveError] = useState('')
  const { t } = useTranslation()


  // Asset and network can be changed, initialized from wallet flow or defaults
  const [selectedAsset, setSelectedAsset] = useState<AssetSymbol>('BTC')
  const selectedMethod = recvInfo.method ?? TRANSFER_METHOD.bitcoin

  useEffect(() => {
    setError(aspInfo.unreachable ? t('errors.send.arkade.server') : '')
  }, [aspInfo.unreachable])

  useEffect(() => {
    pingFaucet(aspInfo)
      .then(setFaucetAvailable)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!svcWallet) return
    getReceivingAddresses(svcWallet)
      .then(({ offchainAddr, boardingAddr }) => {
        if (!offchainAddr) throw t('errors.receive.general.offChain')
        if (!boardingAddr) throw t('errors.receive.general.boarding')
        setRecvInfo({
          ...recvInfo,
          boardingAddr,
          offchainAddr,
          method: recvInfo.method ?? TRANSFER_METHOD.bitcoin,
        })
      })
      .catch((err) => {
        const error = extractError(err)
        consoleError(error, 'error getting addresses')
        setError(error)
      })
  }, [svcWallet])

  if (!svcWallet) return <Loading text= {t('common.general.loading')} />

  const handleFaucet = async () => {
    try {
      if (!satoshis) throw t('errors.receive.general.amount')
      setFauceting(true)
      const ok = await callFaucet(recvInfo.offchainAddr, satoshis, aspInfo)
      if (!ok) throw t('errors.receive.general.faucetFail')
      setFauceting(false)
      setFaucetSuccess(true)
    } catch (err) {
      consoleError(err, 'error fauceting')
      setError(extractError(err))
      setFauceting(false)
    }
  }

  // manage all possible receive methods
  const { boardingAddr, offchainAddr } = recvInfo
  const isLightningMethod = selectedMethod === TRANSFER_METHOD.lightning
  const allowUtxo = validUtxoTx(satoshis) && utxoTxsAllowed()
  const allowVtxo = validVtxoTx(satoshis) && vtxoTxsAllowed()

  const address = selectedMethod === TRANSFER_METHOD.bitcoin ? (allowUtxo ? boardingAddr : '') : ''
  const arkAddress = selectedMethod === TRANSFER_METHOD.ark ? (allowVtxo ? offchainAddr : '') : ''
  // Bounds now come from the solver's own rendezvous (checked inside the
  // negotiation below), not from the old Boltz submarine-swap limits — so
  // Lightning is always attempted, and out-of-bounds/no-solver surfaces as
  // lnReceiveError instead of pre-emptively hiding the method.
  const useLightning = isLightningMethod
  const noPaymentMethods = !address && !arkAddress && !useLightning
  const showFaucetButton = balance === 0 && faucetAvailable
  const pendingLnReceive = recvInfo.pendingLnReceive
  const lightningFee =
    pendingLnReceive && pendingLnReceive.payAmount > satoshis ? pendingLnReceive.payAmount - satoshis : 0
  const showLightningFees = isLightningMethod && lightningFee > 0

  // For Lightning, require amount before showing QR code
  const needsAmountInput = isLightningMethod && !satoshis

  // Get T&Cs for current method
  const termsAndConditions = TERMS_AND_CONDITIONS.receive[selectedMethod]

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

  const shareText = invoice || arkAddress || address
  const disabled = !canBrowserShareData({ title: t('common.general.receive'), text: shareText }) || sharing

  // set the QR code value to the plain address the first time
  useEffect(() => {
    const nextBip21 = encodeBip21(address, arkAddress, invoice, satoshis)
    setBip21uri(nextBip21)
    setQrValue(invoice || arkAddress || address)
    if (invoice) setShowQrCode(true)
  }, [invoice, address, arkAddress, satoshis])

  // Invalidate any existing invoice when the user edits the Lightning amount,
  // so the swap-creation effect below regenerates at the new amount instead of
  // leaving a stale invoice pinned at whatever amount won the first race.
  const isFirstSatoshisRender = useRef(true)
  useEffect(() => {
    if (isFirstSatoshisRender.current) {
      isFirstSatoshisRender.current = false
      return
    }
    if (!isLightningMethod) return
    setInvoice('')
    setShowQrCode(false)
    setLnReceiveError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satoshis])

  useEffect(() => {
    if (invoice) {
      setShowQrCode(true)
      return
    }

    if (!(useLightning && svcWallet && satoshis > 0)) {
      setShowQrCode(true)
      return
    }

    // Debounce: wait until the user stops typing before hitting the solver.
    // Without this, each keystroke (1 -> 10 -> 100 -> 10_000 -> 100_000) fires
    // a parallel negotiation; the first one to reply wins and the real amount
    // is never requested.
    //
    // `requestReceive` persists the swap with `RfqSwapManager` before
    // returning it, so once this resolves the claim is already the manager's
    // job — it drives it to completion on its own timer, independent of this
    // screen's lifetime. The payment lands at the wallet's own address, so
    // the VTXO listener below is what reports success.
    let cancelled = false
    const handle = setTimeout(() => {
      setLnReceiveError('')
      // As of this writing, the only published card (BUNDLED_CARDS's
      // beta-solver) disables its base (Arkade/receive) side — min/max
      // base amount "0" — so this reliably throws until a solver
      // publishes a receive-enabled card. See arkade-os/lightning-swap-service#64
      // and the same note in lib/lnSwap.ts. Lightning SEND is unaffected.
      requestReceive(satoshis)
        .then((pending) => {
          if (cancelled) return
          setRecvInfo({ ...recvInfo, invoice: pending.invoice, pendingLnReceive: pending })
          setInvoice(pending.invoice)
        })
        .catch((error) => {
          if (cancelled) return
          setShowQrCode(true)
          const message = extractError(error)
          consoleError(message, 'error negotiating lightning receive')
          setLnReceiveError(message)
        })
    }, 700)

    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [satoshis, invoice, useLightning, svcWallet, requestReceive])

  useEffect(() => {
    if (!svcWallet) return

    const listenForPayments = (event: MessageEvent) => {
      if (!event.data) return
      // v0.4 SDK wraps broadcast data under `payload`; fall back to the flat
      // shape for safety in case an older worker build is still active.
      const payload = event.data.payload ?? event.data
      let incomingSats = 0
      if (event.data.type === 'VTXO_UPDATE') {
        const newVtxos = (payload?.newVtxos ?? []) as { value: number }[]
        incomingSats = newVtxos.reduce((acc, v) => acc + v.value, 0)
      }
      if (event.data.type === 'UTXO_UPDATE') {
        const coins = (payload?.coins ?? []) as { value: number }[]
        incomingSats = coins.reduce((acc, v) => acc + v.value, 0)
      }
      if (incomingSats) {
        setRecvInfo({ ...recvInfo, satoshis: incomingSats })
        notifyPaymentReceived(incomingSats)
      }
    }

    navigator.serviceWorker.addEventListener('message', listenForPayments)

    return () => {
      navigator.serviceWorker.removeEventListener('message', listenForPayments)
    }
  }, [svcWallet])

  const handleShare = () => {
    const shareText = invoice || arkAddress || address
    setSharing(true)
    shareData({ title: t('common.general.receive'), text: shareText })
      .catch(consoleError)
      .finally(() => setSharing(false))
  }

  if (fauceting) {
    return (
      <>
        <Header text={t('common.general.fauceting')} />
        <Content>
          <Loading text={t('common.notifications.receive.fauceting')} />
        </Content>
      </>
    )
  }

  if (faucetSuccess) {
    const displayAmount = prettyAmount(satoshis ?? 0)
    return (
      <>
        <Header text={t('common.general.success')} />
        <Content>
          <Success headline={t('common.notifications.receive.faucetComplete')} text={t('common.notifications.receive.faucetReceived', { amount: displayAmount })} />
        </Content>
      </>
    )
  }
  
  return (
    <>
      <Header text='' back />
      <Content>
        <Padded>
          <FlexCol>
            <ErrorMessage error={Boolean(error)} text={error} />

            {/* Amount Input for Lightning */}
            {isLightningMethod ? (
              <InlineAmountInput value={satoshis} onChange={setSatoshis} asset={selectedAsset} />
            ) : null}
            <AssetSelector label = '' selected={selectedAsset} onSelect={setSelectedAsset} showValue iconSize = {40}
            style = {{
                     justifyContent: 'center',
                     borderRadius : '2.5rem',
            }} />
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100', gap:'1rem'}}>

            {assetSupportsWrap(requireAssetConfig(selectedAsset).symbol) ? (
              <AssetNetworkSelector
                assetSymbol={requireAssetConfig(selectedAsset).symbol}
                mode='receive'
                label=''
                selected={
                  selectedMethod === TRANSFER_METHOD.bank
                    ? 'bank'
                    : (selectedMethod as AssetNetworkChoice)
                }
                onSelect={(choice) => {
                  if (choice === TRANSFER_METHOD.bank) {
                    setRecvInfo({ ...recvInfo, method: TRANSFER_METHOD.bank })
                    navigate(Pages.BankReceive)
                    return
                  }
                  if (choice === TRANSFER_METHOD.ark) {
                    setInvoice('')
                    setShowQrCode(false)
                    setRecvInfo({ ...recvInfo, method: TRANSFER_METHOD.ark, invoice: undefined })
                    return
                  }
                  // Native source chain selected -> Arkade Wrap flow
                  const symbol = requireAssetConfig(selectedAsset).symbol
                  const option = requireAssetChainOption(symbol, choice as SourceChainId)
                  setWrapRecvInfo({
                    assetSymbol: symbol,
                    chainId: choice as SourceChainId,
                    ticker: option.ticker,
                    receiver: recvInfo.offchainAddr ?? '',
                    sender: '',
                  })
                  navigate(Pages.WrapReceive)
                }}
                style={{ borderRadius: '2.5rem' }}
              />
            ) : (
            <NetworkSelector
              assetSymbol={requireAssetConfig(selectedAsset).symbol}
              label=''
              selected={selectedMethod}
              onSelect={(network) => {
                if (network === TRANSFER_METHOD.bank) {
                  setRecvInfo({ ...recvInfo, method: TRANSFER_METHOD.bank })

                  navigate(Pages.BankReceive)
                  return
                }
                setInvoice('')
                setShowQrCode(false)
                setRecvInfo({ ...recvInfo, method: network, invoice: undefined })
              }}
              style = {{
                     borderRadius : '2.5rem',
                    }}
            />
            )}
            <InfoContainer>
              {needsAmountInput ? (
                <InfoLine
                  compact
                  icon={getIconComponent('info')}
                  text= {t('common.notifications.receive.lightning.lightningNetworkRcv')}
                />
              ) : null}
              {termsAndConditions.map((item) => (
                <InfoLine
                  key={item.text}
                  compact
                  color={item.color}
                  icon={getIconComponent(item.icon)}
                  text={t(item.text)}
                />
              ))}
              {showLightningFees ? (
                <InfoLine
                  compact
                  color='orange'
                  icon={<FeesIcon />}
                  text={t('common.notifications.receive.lightning.lightningFees', { amount: prettyAmount(lightningFee) })}
                />
              ) : null}
            </InfoContainer>
            </div>
            {noPaymentMethods ? (
              <div>{t('common.notifications.receive.invalidAmount')}</div>
            ) : showQrCode ? (
              lnReceiveError && isLightningMethod && !invoice ? (
                <WarningBox text={lnReceiveError} />
              ) : (
                <FlexCol centered>
                  {invoice ? <InfoLine centered color='orange' text={t('common.notifications.receive.lightning.tabOpen')} /> : null}
                  <QrCode value={qrValue} />
                  <ExpandAddresses
                    bip21uri={bip21uri}
                    boardingAddr={address}
                    offchainAddr={arkAddress}
                    invoice={invoice}
                    onClick={setQrValue}
                  />
                </FlexCol>
              )
            ) : (
              <Loading text={t('common.notifications.receive.lightning.generateQR')} />
            )}
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button label={t('common.general.share')} onClick={handleShare} icon={<img src = {checkMarkIcon} alt = 'checkMark' style = {{width: '16px', height: '16px', filter: 'brightness(0) invert(0.7)', marginLeft: '0.5rem'}} />} disabled={disabled} style = {{ margin: '4px 0', fontFamily: 'Titillium Web', fontStyle:'semibold', fontWeight : 600, width: '100%', height: '48px', borderRadius: '16px',}} />
        {showFaucetButton ? <Button disabled={!satoshis} label={t('common.general.faucet')} onClick={handleFaucet} secondary /> : null}
      </ButtonsOnBottom>
    </>
  )
}
