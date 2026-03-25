import { useContext, useEffect, useState } from 'react'
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
import { LightningContext } from '../../../providers/lightning'
import { InfoLine } from '../../../components/Info'
import QrCode from '../../../components/QrCode'
import ExpandAddresses from '../../../components/ExpandAddresses'
import { canBrowserShareData, shareData } from '../../../lib/share'
import { NotificationsContext } from '../../../providers/notifications'
import { encodeBip21 } from '../../../lib/bip21'
import { ASSETS, type AssetSymbol } from '../../../lib/assets'
import AssetIcon from '../../../icons/AssetIcon'
import WhenIcon from '../../../icons/When'
import FeesIcon from '../../../icons/Fees'
import {
  RECEIVE_METHOD_FEES_TEXT,
  RECEIVE_METHOD_TIME_TEXT,
  RECEIVE_METHOD_WARNING_TEXT,
  TRANSFER_METHOD,
  TRANSFER_METHOD_LABELS,
  type TransferMethod,
} from '../../../lib/transferMethods'

export default function ReceiveAmount() {
  const { aspInfo } = useContext(AspContext)
  const { recvInfo, setRecvInfo } = useContext(FlowContext)
  const { navigate } = useContext(NavigationContext)
  const { notifyPaymentReceived } = useContext(NotificationsContext)
  const { arkadeLightning, createReverseSwap, calcReverseSwapFee } = useContext(LightningContext)
  const {
    validLnSwap,
    validUtxoTx,
    validVtxoTx,
    utxoTxsAllowed,
    vtxoTxsAllowed,
  } = useContext(LimitsContext)
  const { balance, svcWallet, wallet } = useContext(WalletContext)

  const [error, setError] = useState('')
  const [fauceting, setFauceting] = useState(false)
  const [faucetSuccess, setFaucetSuccess] = useState(false)
  const [faucetAvailable, setFaucetAvailable] = useState(false)
  const [satoshis, setSatoshis] = useState(0) // No amount input, always 0 for flexible QR codes
  const [sharing, setSharing] = useState(false)
  const [invoice, setInvoice] = useState(recvInfo.invoice ?? '')
  const [qrValue, setQrValue] = useState('')
  const [bip21uri, setBip21uri] = useState('')
  const [showQrCode, setShowQrCode] = useState(false)

  // Asset and network are pre-selected by AssetNetworkSelect
  const selectedAsset: AssetSymbol = 'BTC' // For now only BTC is supported
  const selectedMethod = recvInfo.method ?? TRANSFER_METHOD.bitcoin

  useEffect(() => {
    setError(aspInfo.unreachable ? 'Ark server unreachable' : '')
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
        if (!offchainAddr) throw 'Unable to get offchain address'
        if (!boardingAddr) throw 'Unable to get boarding address'
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

  if (!svcWallet) return <Loading text='Loading...' />

  const handleFaucet = async () => {
    try {
      if (!satoshis) throw 'Invalid amount'
      setFauceting(true)
      const ok = await callFaucet(recvInfo.offchainAddr, satoshis, aspInfo)
      if (!ok) throw 'Faucet failed'
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
  const allowUtxo = validUtxoTx(satoshis) && utxoTxsAllowed()
  const allowVtxo = validVtxoTx(satoshis) && vtxoTxsAllowed()
  const allowLn = validLnSwap(satoshis)

  const address = selectedMethod === TRANSFER_METHOD.bitcoin ? (allowUtxo ? boardingAddr : '') : ''
  const arkAddress = selectedMethod === TRANSFER_METHOD.ark ? (allowVtxo ? offchainAddr : '') : ''
  const useLightning = selectedMethod === TRANSFER_METHOD.lightning ? allowLn : false
  const noPaymentMethods = !address && !arkAddress && !useLightning
  const showFaucetButton = balance === 0 && faucetAvailable
  const showLightningFees = satoshis && selectedMethod === TRANSFER_METHOD.lightning
  const reverseSwapFee = calcReverseSwapFee(satoshis)
  const lightningFeeText = `Lightning fees: ${prettyAmount(reverseSwapFee)}`
  const methodTimeInfo = `Transfer time: ${RECEIVE_METHOD_TIME_TEXT[selectedMethod]}`
  const methodFeesInfo = `Fees: ${RECEIVE_METHOD_FEES_TEXT[selectedMethod]}`
  const methodWarningInfo = RECEIVE_METHOD_WARNING_TEXT[selectedMethod]

  const disabled = !canBrowserShareData({ title: 'Receive', text: qrValue }) || sharing

  // set the QR code value to the bip21uri the first time
  useEffect(() => {
    const nextBip21 = encodeBip21(address, arkAddress, invoice, satoshis)
    setBip21uri(nextBip21)
    setQrValue(nextBip21)
    if (invoice) setShowQrCode(true)
  }, [invoice, address, arkAddress, satoshis])

  useEffect(() => {
    if (invoice) {
      setShowQrCode(true)
      return
    }

    if (useLightning && wallet && svcWallet && arkadeLightning) {
      createReverseSwap(satoshis)
        .then((pendingSwap) => {
          if (!pendingSwap) throw new Error('Failed to create reverse swap')
          const invoice = pendingSwap.response.invoice
          setRecvInfo({ ...recvInfo, invoice })
          setInvoice(invoice)
          arkadeLightning
            .waitAndClaim(pendingSwap)
            .then(() => {
              setRecvInfo({ ...recvInfo, satoshis: pendingSwap.response.onchainAmount })
              notifyPaymentReceived(pendingSwap.response.onchainAmount)
            })
            .catch((error) => {
              setShowQrCode(true)
              consoleError(error, 'Error claiming reverse swap:')
            })
        })
        .catch((error) => {
          setShowQrCode(true)
          consoleError(error, 'Error creating reverse swap:')
        })
    } else {
      setShowQrCode(true)
    }
  }, [satoshis, arkadeLightning, invoice, useLightning])

  useEffect(() => {
    if (!svcWallet) return

    const listenForPayments = (event: MessageEvent) => {
      let incomingSats = 0
      if (event.data && event.data.type === 'VTXO_UPDATE') {
        const newVtxos = event.data.newVtxos as { value: number }[]
        incomingSats = newVtxos.reduce((acc, v) => acc + v.value, 0)
      }
      if (event.data && event.data.type === 'UTXO_UPDATE') {
        const coins = event.data.coins as { value: number }[]
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
    setSharing(true)
    shareData({ title: 'Receive', text: qrValue })
      .catch(consoleError)
      .finally(() => setSharing(false))
  }

  if (fauceting) {
    return (
      <>
        <Header text='Fauceting' />
        <Content>
          <Loading text='Getting sats from a faucet. This may take a few moments.' />
        </Content>
      </>
    )
  }

  if (faucetSuccess) {
    const displayAmount = prettyAmount(satoshis ?? 0)
    return (
      <>
        <Header text='Success' />
        <Content>
          <Success headline='Faucet completed!' text={`${displayAmount} received successfully`} />
        </Content>
      </>
    )
  }

  return (
    <>
      <Header text='Receive' back />
      <Content>
        <Padded>
          <FlexCol>
            <ErrorMessage error={Boolean(error)} text={error} />
            {/* Network indicator (non-editable - set by AssetNetworkSelect) */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1rem',
              borderRadius: '12px',
              backgroundColor: 'var(--white05)',
              border: '1px solid var(--white10)',
              justifyContent: 'center',
              marginBottom: '1rem',
            }}>
              <AssetIcon symbol={selectedAsset} size={24} />
              <span style={{ color: 'white', fontSize: '1rem' }}>
                {ASSETS[selectedAsset].name} via {TRANSFER_METHOD_LABELS[selectedMethod] || selectedMethod}
              </span>
            </div>
            {Boolean(methodWarningInfo || showLightningFees || methodTimeInfo || methodFeesInfo) && (
              <InfoContainer>
                {methodWarningInfo ? <InfoLine compact color='orange' text={methodWarningInfo} /> : null}
                {showLightningFees ? <InfoLine compact color='orange' icon={<FeesIcon />} text={lightningFeeText} /> : null}
                {methodTimeInfo ? <InfoLine compact icon={<WhenIcon />} text={methodTimeInfo} /> : null}
                {methodFeesInfo ? <InfoLine compact icon={<FeesIcon />} text={methodFeesInfo} /> : null}
              </InfoContainer>
            )}
            {noPaymentMethods ? (
              <div>No valid payment methods available for this amount</div>
            ) : showQrCode ? (
              <FlexCol centered>
                {invoice ? <InfoLine centered color='orange' text='Keep tab open to receive Lightning' /> : null}
                <QrCode value={qrValue} />
                <ExpandAddresses
                  bip21uri={bip21uri}
                  boardingAddr={address}
                  offchainAddr={arkAddress}
                  invoice={invoice}
                  onClick={setQrValue}
                />
              </FlexCol>
            ) : (
              <Loading text='Generating QR code...' />
            )}
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button label='Share' onClick={handleShare} disabled={disabled} />
        {showFaucetButton ? <Button disabled={!satoshis} label='Faucet' onClick={handleFaucet} secondary /> : null}
      </ButtonsOnBottom>
    </>
  )
}
