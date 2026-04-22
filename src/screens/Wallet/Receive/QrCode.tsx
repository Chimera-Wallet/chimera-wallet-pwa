import { useContext, useEffect, useState } from 'react'
import Button from '../../../components/Button'
import Padded from '../../../components/Padded'
import QrCode from '../../../components/QrCode'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import { FlowContext } from '../../../providers/flow'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { WalletContext } from '../../../providers/wallet'
import { NotificationsContext } from '../../../providers/notifications'
import Header from '../../../components/Header'
import Content from '../../../components/Content'
import { consoleError } from '../../../lib/logs'
import { canBrowserShareData, shareData } from '../../../lib/share'
import ExpandAddresses from '../../../components/ExpandAddresses'
import FlexCol from '../../../components/FlexCol'
import { LimitsContext } from '../../../providers/limits'
import { Coin, ExtendedVirtualCoin } from '@arkade-os/sdk'
import Loading from '../../../components/Loading'
import { LightningContext } from '../../../providers/lightning'
import { encodeBip21 } from '../../../lib/bip21'
import { InfoLine } from '../../../components/Info'
import { TRANSFER_METHOD } from '../../../lib/transferMethods'

export default function ReceiveQRCode() {
  const { navigate } = useContext(NavigationContext)
  const { recvInfo, setRecvInfo } = useContext(FlowContext)
  const { notifyPaymentReceived } = useContext(NotificationsContext)
  const { arkadeLightning, createReverseSwap } = useContext(LightningContext)
  const { svcWallet, wallet } = useContext(WalletContext)
  const { validLnSwap, validUtxoTx, validVtxoTx, utxoTxsAllowed, vtxoTxsAllowed } = useContext(LimitsContext)

  const [sharing, setSharing] = useState(false)

  // manage all possible receive methods
  const { boardingAddr, offchainAddr, satoshis } = recvInfo
  const selectedMethod = recvInfo.method ?? TRANSFER_METHOD.bitcoin
  const allowUtxo = validUtxoTx(satoshis) && utxoTxsAllowed()
  const allowVtxo = validVtxoTx(satoshis) && vtxoTxsAllowed()
  const allowLn = validLnSwap(satoshis)

  const address = selectedMethod === TRANSFER_METHOD.bitcoin ? (allowUtxo ? boardingAddr : '') : ''
  const arkAddress = selectedMethod === TRANSFER_METHOD.ark ? (allowVtxo ? offchainAddr : '') : ''
  const useLightning = selectedMethod === TRANSFER_METHOD.lightning ? allowLn : false
  const noPaymentMethods = !address && !arkAddress && !useLightning
  const defaultBip21uri = encodeBip21(address, arkAddress, '', satoshis)

  const [invoice, setInvoice] = useState(recvInfo.invoice ?? '')
  const [qrValue, setQrValue] = useState(invoice || arkAddress || address)
  const [bip21uri, setBip21uri] = useState(defaultBip21uri)
  const [showQrCode, setShowQrCode] = useState(false)

  // set the QR code value to the plain address the first time
  useEffect(() => {
    const bip21uri = encodeBip21(address, arkAddress, invoice, satoshis)
    setBip21uri(bip21uri)
    setQrValue(invoice || arkAddress || address)
    if (invoice) setShowQrCode(true)
  }, [invoice])

  useEffect(() => {
    // if boltz is available and amount is between limits, let's create a swap invoice
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
          // Use waitAndClaim which delegates to SwapManager if enabled
          arkadeLightning
            .waitAndClaim(pendingSwap)
            .then(() => {
              setRecvInfo({ ...recvInfo, satoshis: pendingSwap.response.onchainAmount ?? satoshis })
              navigate(Pages.ReceiveSuccess)
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
      if (!event.data) return
      // v0.4 SDK wraps broadcast data under `payload`; fall back to the flat
      // shape for safety in case an older worker build is still active.
      const payload = event.data.payload ?? event.data
      let satoshis = 0
      if (event.data.type === 'VTXO_UPDATE') {
        const newVtxos = (payload?.newVtxos ?? []) as ExtendedVirtualCoin[]
        satoshis = newVtxos.reduce((acc, v) => acc + v.value, 0)
      }
      if (event.data.type === 'UTXO_UPDATE') {
        const coins = (payload?.coins ?? []) as Coin[]
        satoshis = coins.reduce((acc, v) => acc + v.value, 0)
      }
      if (satoshis) {
        setRecvInfo({ ...recvInfo, satoshis })
        notifyPaymentReceived(satoshis)
        navigate(Pages.ReceiveSuccess)
      }
    }

    navigator.serviceWorker.addEventListener('message', listenForPayments)

    return () => {
      navigator.serviceWorker.removeEventListener('message', listenForPayments)
    }
  }, [svcWallet])

  const shareText = invoice || arkAddress || address

  const handleShare = () => {
    setSharing(true)
    shareData({ title: 'Receive', text: shareText })
      .catch(consoleError)
      .finally(() => setSharing(false))
  }

  const disabled = !canBrowserShareData({ title: 'Receive', text: shareText }) || sharing

  return (
    <>
      <Header text='Receive' back />
      <Content>
        <Padded>
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
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button onClick={handleShare} label='Share' disabled={disabled} />
      </ButtonsOnBottom>
    </>
  )
}
