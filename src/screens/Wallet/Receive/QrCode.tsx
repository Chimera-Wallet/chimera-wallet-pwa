import { useContext, useEffect, useState } from 'react'
import Button from '../../../components/Button'
import Padded from '../../../components/Padded'
import QrCode from '../../../components/QrCode'
import { FlowContext } from '../../../providers/flow'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { WalletContext } from '../../../providers/wallet'
import { NotificationsContext } from '../../../providers/notifications'
import Header from '../../../components/Header'
import Content from '../../../components/Content'
import { consoleError } from '../../../lib/logs'
import { canBrowserShareData, shareData } from '../../../lib/share'
import FlexCol from '../../../components/FlexCol'
import FlexRow from '../../../components/FlexRow'
import { LimitsContext } from '../../../providers/limits'
import { Asset, Coin, ExtendedVirtualCoin } from '@arkade-os/sdk'
import LoadingLogo from '../../../components/LoadingLogo'
import { SwapsContext } from '../../../providers/swaps'
import { encodeBip21, encodeBip21Asset } from '../../../lib/bip21'
import { BoltzChainSwap, BoltzReverseSwap } from '@arkade-os/boltz-swap'
import { enableChainSwapsReceive, lnurlServerUrl } from '../../../lib/constants'
import { unitsToCents } from '../../../lib/assets'
import WarningBox from '../../../components/Warning'
import ErrorMessage from '../../../components/Error'
import { getReceivingAddresses } from '../../../lib/asp'
import { extractError } from '../../../lib/error'
import InputAmount from '../../../components/InputAmount'
import Keyboard from '../../../components/Keyboard'
import SheetModal from '../../../components/SheetModal'
import Text, { TextSecondary } from '../../../components/Text'
import { copyToClipboard } from '../../../lib/clipboard'
import { useToast } from '../../../components/Toast'
import { prettyLongText, prettyNumber } from '../../../lib/format'
import CopyIcon from '../../../icons/Copy'
import CheckMarkIcon from '../../../icons/CheckMark'
import { hapticSubtle } from '../../../lib/haptics'
import { isMobileBrowser } from '../../../lib/browser'
import Focusable from '../../../components/Focusable'
import { LnurlContext } from '../../../providers/lnurl'
import { useReducedMotion } from '../../../hooks/useReducedMotion'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import { AssetOption } from '../../../lib/types'
import { EASE_OUT_QUINT } from '../../../lib/animations'
import { ConfigContext } from '../../../providers/config'
import { FiatContext } from '../../../providers/fiat'
import { useTranslation } from 'react-i18next'
import { LnReceiveContext } from '../../../providers/lnReceive'



/**
 * Decide which value the QR should encode. Honours an explicit copy-sheet
 * selection, but only while that value is still one we currently offer — once
 * the selected address is regenerated or removed (e.g. an amount
 * change), fall back to the unified BIP21 URI. This stops async rebuilds from
 * silently reverting the user's pick and copying the wrong thing.
 */
export const resolveQrValue = (selected: string, options: { bip21: string; btc: string; ark: string }): string => {
  const candidates = [options.bip21, options.btc, options.ark].filter(Boolean)
  return selected && candidates.includes(selected) ? selected : options.bip21
}

export default function ReceiveQRCode() {
  const { useFiat } = useContext(ConfigContext)
  const { fromFiat } = useContext(FiatContext)
  const { navigate } = useContext(NavigationContext)
  const { recvInfo, setRecvInfo } = useContext(FlowContext)
  const { notifyPaymentReceived } = useContext(NotificationsContext)
  const { arkadeSwaps, swapsInitError, connected, createBtcToArkSwap, createReverseSwap } = useContext(SwapsContext)
  const { assetMetadataCache, svcWallet } = useContext(WalletContext)
  const { minSwapAllowed, validBtcToArk, validLnSwap, utxoTxsAllowed, vtxoTxsAllowed } = useContext(LimitsContext)
  const { requestReceive } = useContext(LnReceiveContext)

  const { toast } = useToast()

  const [assetAmount, setAssetAmount] = useState(BigInt(0))
  const [amountTextValue, setAmountTextValue] = useState('')

  const [sharing, setSharing] = useState(false)
  const [addressesLoaded, setAddressesLoaded] = useState(false)
  const [qrTransform, setQrTransform] = useState('')

  // Amount sheet state
  const [showAmountSheet, setShowAmountSheet] = useState(false)
  const [showKeys, setShowKeys] = useState(false)

  // Copy address sheet state
  const [showCopySheet, setShowCopySheet] = useState(false)
  const [copied, setCopied] = useState('')

  const prefersReducedMotion = useReducedMotion()

  // Receive methods
  const { boardingAddr, offchainAddr, satoshis, assetId, addressError, received } = recvInfo
  const assetMeta = assetId ? assetMetadataCache.get(assetId) : undefined
  const isAssetReceive = assetId && assetId !== ''
  const hasError = Boolean(addressError)

  const [noPaymentMethods, setNoPaymentMethods] = useState(false)
  const [arkAddress, setArkAddress] = useState(offchainAddr)
  const [btcAddress, setBtcAddress] = useState(boardingAddr)
  const [showQrCode, setShowQrCode] = useState(!satoshis)
  const [swapsTimedOut, setSwapsTimedOut] = useState(false)
  const [swapAddress, setSwapAddress] = useState('')
  const [qrCodeValue, setQrCodeValue] = useState('')
  const [bip21Uri, setBip21Uri] = useState('')
  const [invoice, setInvoice] = useState('')
  const [lnReceiveError, setLnReceiveError] = useState('')
  const [selectedValue, setSelectedValue] = useState('')



  const { t } = useTranslation()


  // Fetch addresses on mount
  useEffect(() => {
    if (!svcWallet) return
    if (boardingAddr && offchainAddr) {
      setAddressesLoaded(true)
      return
    }
    getReceivingAddresses(svcWallet)
      .then(({ offchainAddr, boardingAddr }) => {
        if (!offchainAddr) throw t('errors.receive.general.offChain')
        if (!boardingAddr) throw t('errors.receive.general.boarding')
        setRecvInfo({ ...recvInfo, boardingAddr, offchainAddr, satoshis: 0, addressError: undefined })
        setAddressesLoaded(true)
      })
      .catch((err) => {
        const error = extractError(err)
        consoleError(error, 'error getting addresses')
        setRecvInfo({ ...recvInfo, addressError: error })
        setAddressesLoaded(true)
      })
  }, [svcWallet])

  // Keep the local invoice mirror in sync with the negotiated value — this is
  // what gates the "Lightning Invoice" row in the copy sheet.
  useEffect(() => {
    setInvoice(recvInfo.invoice ?? '')
  }, [recvInfo.invoice])

  const lnurlSession = useContext(LnurlContext)
  const isAmountlessLnurl = !satoshis && !isAssetReceive && !!lnurlServerUrl && lnurlSession.active

  const createBtcAddress = () => {
    return new Promise((resolve, reject) => {
      if (!enableChainSwapsReceive) return reject()
      if (!validBtcToArk(satoshis)) return reject()
      createBtcToArkSwap(satoshis)
        .then((result) => {
          if (!result) throw new Error(t('errors.receive.general.chainSwap'))
          resolve(result.pendingSwap)
        })
        .catch((error) => {
          consoleError(error, 'Error creating chain swap')
          reject(error)
        })
    })
  }

  const createBip21 = (): { ark: string; btc: string; bip21: string } => {
    const ark = vtxoTxsAllowed() ? recvInfo.offchainAddr : ''
    const btc = utxoTxsAllowed() ? recvInfo.boardingAddr : ''
    const bip21 = isAssetReceive
      ? encodeBip21Asset(ark, assetId, assetAmount, assetMeta?.metadata?.decimals)
      : encodeBip21(btc, ark, recvInfo.invoice ?? '', satoshis, '')

    return { ark, btc, bip21 }
  }

  // Negotiate the hold invoice. `requestReceive` persists the swap with
  // `RfqSwapManager` before returning it, so once this resolves the claim is
  // already the manager's job — it drives it to completion on its own timer,
  // independent of this screen's lifetime. The payment lands at the wallet's
  // own address, so the VTXO listener below is what reports success.
  useEffect(() => {
    if (!svcWallet || isAssetReceive || satoshis <= 0) return
    if (recvInfo.pendingLnReceive?.payAmount && recvInfo.invoice) return

    let abandoned = false
    setLnReceiveError('')
    // As of this writing, the only published card (BUNDLED_CARDS's
    // beta-solver) disables its base (Arkade/receive) side — min/max base
    // amount "0" — so this reliably throws until a solver publishes a
    // receive-enabled card. See arkade-os/lightning-swap-service#64 and the
    // same note in lib/lnSwap.ts. Lightning SEND is unaffected.
    requestReceive(satoshis)
      .then((pending) => {
        if (abandoned) return
        setLnReceiveError('')
        setRecvInfo((prev) => ({ ...prev, invoice: pending.invoice, pendingLnReceive: pending }))
      })
      .catch((err) => {
        if (abandoned) return
        const error = extractError(err)
        consoleError(error, 'error negotiating lightning receive')
        setLnReceiveError(error)
      })
    // The amount changed under an in-flight negotiation, so its invoice would
    // be for the wrong number. Nothing to cancel on the solver — an unpaid hold
    // invoice simply expires.
    return () => {
      abandoned = true
    }
  }, [svcWallet, satoshis, isAssetReceive, requestReceive])

  // Build BIP21 URI
  useEffect(() => {
    if (!addressesLoaded) return

    const { ark, btc, bip21 } = createBip21()
    // LNURL can be present for both amountless and amounted flows; check the
    // session LNURL or the bip21 value for a lightning param.
    const hasLnurl = Boolean(lnurlSession.lnurl) || isAmountlessLnurl

    // Consider invoice, pending swap address, LNURL, and on-chain addresses
    // as valid payment methods. This prevents the UI from showing
    // "No payments available" when a Lightning invoice or swap is available.
    const hasInvoice = Boolean(recvInfo.invoice)
    const hasSwapAddress = Boolean(swapAddress)
    setNoPaymentMethods(!ark && !btc && !hasInvoice && !hasLnurl && !hasSwapAddress && !isAssetReceive)
    setArkAddress(ark)
    setBtcAddress(btc)
    setBip21Uri(bip21)
    setQrCodeValue(resolveQrValue(selectedValue, { bip21, btc, ark }))
  }, [
    invoice,
    assetAmount,
    addressesLoaded,
    isAmountlessLnurl,
    lnurlSession.lnurl,
    lnurlSession.active,
    recvInfo.offchainAddr,
    recvInfo.boardingAddr,
    recvInfo.satoshis,
    recvInfo.invoice,
    swapAddress,
    showQrCode,
  ])

  // Payment listener
  useEffect(() => {
    if (!svcWallet) return

    const listenForPayments = (event: MessageEvent) => {
      let sats = 0
      let receivedAssets: Asset[] = []

      if (event.data && event.data.type === 'VTXO_UPDATE') {
        const newVtxos = event.data.payload?.newVtxos
        if (Array.isArray(newVtxos)) {
          sats = (newVtxos as ExtendedVirtualCoin[]).reduce((acc, v) => acc + v.value, 0)
          for (const v of newVtxos as ExtendedVirtualCoin[]) {
            receivedAssets.push(...(v.assets ?? []))
          }
        } else {
          consoleError('VTXO_UPDATE message has unexpected payload shape:', event.data.payload)
        }
      }

      receivedAssets = receivedAssets.reduce((acc, v) => {
        const existing = acc.find((a) => a.assetId === v.assetId)
        if (existing) {
          existing.amount += v.amount
        } else {
          acc.push(v)
        }
        return acc
      }, [] as Asset[])

      if (event.data && event.data.type === 'UTXO_UPDATE') {
        const coins = event.data.payload?.coins
        if (Array.isArray(coins)) {
          sats = (coins as Coin[]).reduce((acc, v) => acc + v.value, 0)
        } else {
          consoleError('UTXO_UPDATE message has unexpected payload shape:', event.data.payload)
        }
      }

      if (sats || receivedAssets.length > 0) {
        setRecvInfo({ ...recvInfo, received: true, satoshis: sats, receivedAssets })
        if (!isAssetReceive) notifyPaymentReceived(sats)
        navigate(Pages.ReceiveSuccess)
      }
    }

    navigator.serviceWorker.addEventListener('message', listenForPayments)
    return () => navigator.serviceWorker.removeEventListener('message', listenForPayments)
  }, [svcWallet])

  // Handlers
  const handleShare = () => {
    setSharing(true)
    shareData({ title: t('common.general.receive'), text: qrCodeValue })
      .catch(consoleError)
      .finally(() => setSharing(false))
  }

  const handleCopy = async (value: string) => {
    if (!prefersReducedMotion) hapticSubtle()
    await copyToClipboard(value)
    toast(t('common.general.copyClipboard'))
    setShowCopySheet(false)
    setCopied(value)
  }

  const handleCopyButton = async () => {
    if (!prefersReducedMotion) hapticSubtle()
    setShowCopySheet(true)
    if (qrCodeValue && copied !== qrCodeValue) {
      await copyToClipboard(qrCodeValue)
      toast(t('common.general.copyClipboard'))
      setCopied(qrCodeValue)
    }
  }

  const handleAmountConfirm = (value = amountTextValue) => {
    setShowKeys(false)
    setShowAmountSheet(false)
    if (assetMeta) {
      const decimals = assetMeta.metadata?.decimals
      const cents = unitsToCents(value, decimals)
      return setAssetAmount(cents)
    } else {
      const num = Number(value)
      if (Number.isNaN(num) || !Number.isFinite(num)) throw new Error(t('errors.receive.general.invalidAmount'))
      const sats = useFiat ? fromFiat(num) : num
      // if amount was changed, we need to reset invoice and swap address, since they are amount-specific
      // this will also trigger the useEffect to create new ones if needed
      if (sats !== recvInfo.satoshis) {
        setInvoice('')
        setSwapAddress('')
        setShowQrCode(false)
      }
      setRecvInfo({ ...recvInfo, satoshis: sats })
    }
  }

  const handleAmountClear = () => {
    setAmountTextValue('')
    if (assetMeta) setAssetAmount(BigInt(0))
    else setRecvInfo({ ...recvInfo, satoshis: 0 })
  }

  const assetOption: AssetOption = {
    assetId: assetId ?? '',
    name: assetMeta?.metadata?.name ?? '',
    ticker: assetMeta?.metadata?.ticker ?? '',
    balance: BigInt(0),
    decimals: assetMeta?.metadata?.decimals ?? 0,
    icon: assetMeta?.metadata?.icon,
  }

  const data = { title: t('common.general.receive'), text: qrCodeValue }
  const shareDisabled = !canBrowserShareData(data) || sharing || hasError || noPaymentMethods

  // Mobile keyboard — bypass sheet on save, go straight to QR
  if (showKeys) {
    return (
      <Keyboard
        hideBalance
        asset={assetOption}
        back={() => {
          setShowKeys(false)
          setShowAmountSheet(false)
        }}
        onSave={(value: string) => {
          setShowKeys(false)
          setShowAmountSheet(false)
          handleAmountConfirm(value)
        }}
      />
    )
  }

  const amountLabel = satoshis ? t('common.notifications.receive.editAmount') : t('common.notifications.receive.addAmount')
  const unitLabel = assetMeta?.metadata?.ticker ?? 'sats'

  return (
    <>
      <Header text={t('common.general.receive')} back={() => navigate(Pages.Wallet)} />
      <Content noFade>
        <Padded>
          {hasError ? (
            <ErrorMessage error text={t('errors.receive.general.getAddress', {address: addressError})} />
          ) : !addressesLoaded || (!qrCodeValue && !noPaymentMethods) ? (
            <LoadingLogo text={t('common.general.loading')} />
          ) : noPaymentMethods ? (
            <div>{t('common.notifications.receive.invalidAmount')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 2rem)', gap: '1rem' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <button
                    type='button'
                    onClick={() => handleCopy(qrCodeValue)}
                    onPointerDown={() => setQrTransform(prefersReducedMotion ? '' : 'scale(0.97)')}
                    onPointerUp={() => setQrTransform('')}
                    onPointerLeave={() => setQrTransform('')}
                    onPointerCancel={() => setQrTransform('')}
                    aria-label= {t('common.notifications.receive.copyQr')}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      margin: '0 auto',
                      display: 'block',
                      width: '100%',
                      maxWidth: '340px',
                      cursor: 'pointer',
                      transition: prefersReducedMotion
                        ? 'none'
                        : `transform 240ms cubic-bezier(${EASE_OUT_QUINT.join(',')})`,
                      WebkitTapHighlightColor: 'transparent',
                      touchAction: 'manipulation',
                      transform: qrTransform,
                    }}
                  >
                    <QrCode value={qrCodeValue} />
                  </button>
                  {satoshis > 0 ? (
                    <div style={{ fontSize: '14px', color: 'var(--neutral-500)', marginTop: '0.5rem' }}>
                      {t('common.notifications.receive.request', {amount: prettyNumber(satoshis, 0), label: unitLabel})}
                    </div>
                  ) : null}
                  {(!satoshis || satoshis < minSwapAllowed()) && !isAssetReceive ? (
                    <div style={{ fontSize: '13px', color: 'var(--neutral-500)', marginTop: '0.25rem' }}>
                      {t('common.notifications.receive.minLightning',{amount: minSwapAllowed()})}
                    </div>
                  ) : null}
                  {swapsTimedOut && !invoice && !isAssetReceive ? (
                    <WarningBox text={t('errors.receive.lightning.tempUnavailable')} />
                  ) : null}
                  {lnReceiveError && !invoice && !isAssetReceive ? (
                    <WarningBox text={lnReceiveError} />
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </Padded>
      </Content>

      <ButtonsOnBottom>
        <FlexRow gap='0.75rem'>
          <Button
            label={amountLabel}
            onClick={() => (isMobileBrowser ? setShowKeys(true) : setShowAmountSheet(true))}
            secondary
          />
          <Button label={t('common.general.copy')} onClick={handleCopyButton} secondary />
        </FlexRow>
        <Button label={t('common.general.share')} onClick={handleShare} disabled={shareDisabled} />
      </ButtonsOnBottom>

      {/* Amount bottom sheet */}
      <SheetModal isOpen={showAmountSheet} onClose={() => setShowAmountSheet(false)}>
        <FlexCol gap='1rem' padding='0.5rem 0'>
          <Text big bold>
            {t('common.notifications.receive.addAmount')}
          </Text>
          <InputAmount
            label={t('common.general.amount')}
            asset={assetOption}
            value={amountTextValue}
            focus={!isMobileBrowser}
            readOnly={isMobileBrowser}
            name='receive-amount-sheet'
            onChange={setAmountTextValue}
            onEnter={handleAmountConfirm}
            onFocus={() => setShowKeys(isMobileBrowser)}
          />
          <Button label= {t('common.notifications.receive.setAmount')} onClick={() => handleAmountConfirm()} disabled={!amountTextValue} />
          {satoshis > 0 ? <Button label={t('common.notifications.receive.clearAmount')} onClick={handleAmountClear} secondary /> : null}
        </FlexCol>
      </SheetModal>

      {/* Copy address bottom sheet */}
      <SheetModal isOpen={showCopySheet} onClose={() => setShowCopySheet(false)}>
        <FlexCol gap='1rem' padding='0.5rem 0'>
          <Text big bold>
            {t('common.general.copyAddress')}
          </Text>
          <AddressList
            bip21Uri={bip21Uri}
            btcAddress={btcAddress}
            arkAddress={arkAddress}
            lnurl={lnurlSession.lnurl}
            invoice={invoice}
            onCopy={handleCopy}
            onSelect={(v) => {
              setQrCodeValue(v)
              setShowCopySheet(false)
            }}
            copied={copied}
          />
        </FlexCol>
      </SheetModal>
    </>
  )
}

function AddressList({
  bip21Uri,
  btcAddress,
  arkAddress,
  invoice,
  lnurl,
  onCopy,
  onSelect,
  copied,
}: {
  bip21Uri: string
  btcAddress: string
  arkAddress: string
  invoice: string
  lnurl: string
  onCopy: (value: string) => void
  onSelect: (value: string) => void
  copied: string
}) {
  const {t} = useTranslation()
  return (
    <FlexCol gap='0.75rem'>
      {bip21Uri ? (
        <AddressLine
          testId='bip21'
          title='Unified'
          value={bip21Uri}
          onCopy={onCopy}
          onSelect={onSelect}
          copied={copied}
        />
      ) : null}
      {invoice ? (
        <AddressLine
          testId='invoice'
          title= {t('common.notifications.receive.lightning.lightningInvoice')}
          value={invoice}
          onCopy={onCopy}
          onSelect={onSelect}
          copied={copied}
        />
      ) : null}
      {arkAddress ? (
        <AddressLine
          testId='ark'
          title={t('common.notifications.receive.arkade.arkadeAddress')}
          value={arkAddress}
          onCopy={onCopy}
          onSelect={onSelect}
          copied={copied}
        />
      ) : null}
      {btcAddress ? (
        <AddressLine
          testId='btc'
          title={t('common.notifications.receive.bitcoin.bitcoinAddress')}
          value={btcAddress}
          onCopy={onCopy}
          onSelect={onSelect}
          copied={copied}
        />
      ) : null}
      {lnurl ? (
        <AddressLine
          testId='lnurl'
          title={t('common.notifications.receive.lnurl.lnurlAddress')}
          value={lnurl}
          onCopy={onCopy}
          onSelect={onSelect}
          copied={copied}
        />
      ) : null}
    </FlexCol>
  )
}

function AddressLine({
  testId,
  title,
  value,
  onCopy,
  onSelect,
  copied,
}: {
  testId: string
  title: string
  value: string
  onCopy: (value: string) => void
  onSelect: (value: string) => void
  copied: string
}) {
  const {t} = useTranslation()
  return (
    <Focusable
      onEnter={() => {
        onCopy(value)
        onSelect(value)
      }}
    >
      <FlexRow between onClick={() => onSelect(value)}>
        <FlexCol gap='0'>
          <TextSecondary>{title}</TextSecondary>
          <Text>{prettyLongText(value, 12)}</Text>
        </FlexCol>
        <Button
          copy
          ariaLabel={t('lib.transactions.copyAddr', {title:title})}
          testId={testId + '-address-copy'}
          onClick={(event) => {
            event.stopPropagation()
            onCopy(value)
          }}
        >
          {copied === value ? <CheckMarkIcon /> : <CopyIcon />}
        </Button>
      </FlexRow>
    </Focusable>
  )
}
