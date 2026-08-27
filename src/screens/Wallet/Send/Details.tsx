import { useContext, useEffect, useState } from 'react'
import Button from '../../../components/Button'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { FlowContext } from '../../../providers/flow'
import Padded from '../../../components/Padded'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import Details, { DetailsProps } from '../../../components/Details'
import ErrorMessage from '../../../components/Error'
import { WalletContext } from '../../../providers/wallet'
import Header from '../../../components/Header'
import { defaultFee } from '../../../lib/constants'
import { prettyNumber, fromSatoshis } from '../../../lib/format'
import Content from '../../../components/Content'
import FlexCol from '../../../components/FlexCol'
import { collaborativeExitWithFees, sendAssets, sendOffChain } from '../../../lib/asp'
import { extractError } from '../../../lib/error'
import Loading from '../../../components/Loading'
import { consoleError } from '../../../lib/logs'
import { LimitsContext } from '../../../providers/limits'
import { SwapsContext } from '../../../providers/swaps'
import Text from '../../../components/Text'
import { isPendingChainSwap, isPendingSubmarineSwap } from '@arkade-os/boltz-swap'
import { FeesContext } from '../../../providers/fees'
import { prettyAssetAmount } from '../../../lib/assets'
import { TxResultContext } from '../../../providers/txResult'
import {useTranslation} from 'react-i18next'
import { type LnSendRequest } from '../../../lib/lnSwap'
import { saveTransactionActivityMetadata } from '../../../lib/storage'
import type { LnSendActivity } from '../../../lib/types'


export default function SendDetails() {
  const { navigate } = useContext(NavigationContext)
  const { sendInfo, setSendInfo } = useContext(FlowContext)
  const { calcOnchainOutputFee } = useContext(FeesContext)
  const isAssetSend = Boolean(sendInfo.assets?.length)
  const { lnSwapsAllowed, utxoTxsAllowed, vtxoTxsAllowed } = useContext(LimitsContext)
  const { payInvoice, payBtc } = useContext(SwapsContext)
  const { assetMetadataCache, balance, svcWallet } = useContext(WalletContext)
  const { notifyResult } = useContext(TxResultContext)

  const assetId = sendInfo.assets?.[0]?.assetId
  const assetMeta = assetId ? assetMetadataCache.get(assetId) : undefined
  const assetTicker = assetMeta?.metadata?.ticker ?? ''
  const assetName = assetMeta?.metadata?.name ?? 'Asset'
  const assetAmountValue = sendInfo.assets?.[0]?.amount ?? BigInt(0)

  const [buttonLabel, setButtonLabel] = useState('')
  const [details, setDetails] = useState<DetailsProps>()
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [sendDone, setSendDone] = useState(false)

  const { address, arkAddress, invoice, pendingSwap,pendingLnSend, satoshis } = sendInfo
  const { t } = useTranslation()
  

  useEffect(() => {
    if (!address && !arkAddress && !invoice) return setError(t('errors.general.missingAddress'))
    if (isAssetSend) {
      if (!assetAmountValue) return setError(t('errors.general.missingAsset'))
      const destination = arkAddress ?? ''
      const feeInSats = defaultFee
      setDetails({
        destination,
        direction: t('common.general.sendAsset'),
        fees: feeInSats,
        satoshis: 0,
        total: feeInSats,
      })
      setButtonLabel(t('common.general.tapSign'))
      return
    }
    if (!satoshis) return setError(t('errors.general.missingAmount'))
    const destination =
      arkAddress && vtxoTxsAllowed()
        ? arkAddress
        : invoice && (pendingSwap || pendingLnSend) && lnSwapsAllowed()
          ? invoice
          : address && utxoTxsAllowed()
            ? address
            : ''
    const direction =
      destination === arkAddress
        ? t('common.directions.arkade')
        : destination === invoice
          ? t('common.directions.lightningSwap')
          : pendingSwap?.type === 'chain'
            ? t('common.directions.mainnetSwap')
            : destination === address
              ? t('common.directions.mainnetPay')
              : ''
    const total = pendingSwap
      ? pendingSwap.type === 'chain'
        ? pendingSwap.response.lockupDetails.amount
        : pendingSwap.type === 'submarine'
          ? pendingSwap.response.expectedAmount
          : satoshis
      : pendingLnSend
        ? pendingLnSend.fundAmount
        : satoshis
    const amount = direction === t('common.general.directions.mainnetPay') ? satoshis - calcOnchainOutputFee() : satoshis
    const fees = total - amount > 0 ? total - amount : 0
    const swapId = pendingSwap?.id ?? pendingLnSend?.rfqId
    setDetails({
      destination,
      direction,
      fees,
      satoshis: amount,
      swapId,
      total,
    })
    if (balance < total) {
      setButtonLabel(t('errors.funds.insufficient'))
      setError(t('errors.funds.insufficientExtra', {
          balance: prettyNumber(fromSatoshis(balance), 8),
        })
    )
    } else {
      setButtonLabel(t('common.general.tapSign'))
    }
  }, [sendInfo, balance])

  const handlePreimage = ({ txid }: { preimage: string; txid: string }) => {
    handleTxid(txid)
  }

  const handleTxid = (txid: string, lnSend? : LnSendActivity) => {
    if (!txid) return handleError(t('errors.send.general.errorSend'))

    saveTransactionActivityMetadata(txid, {
      destination: details?.destination,
      lnSend,
      networkFee: details?.fees,
    })
    setSendInfo({ ...sendInfo, total: details?.total, txid })
    setSendDone(true)
  }

  // Navigate once send is done (no exit animation with chimera Loading).
  // On failure, show the fail popup and return to the form so the user can
  // retry; on success, hand off to SendSuccess which shows the success popup
  // and redirects home.
  useEffect(() => {
    if (!sendDone) return
    if (error) {
      notifyResult(false, t('common.notifications.failedTransaction')).then(() => setSending(false))
      return
    }
    navigate(Pages.SendSuccess)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendDone])

  const handleError = (err: any) => {
    consoleError(err, 'error sending payment')
    setError(extractError(err))
    setSendDone(true)
  }
    /**
   * Fund the covenant. That is the whole of the wallet's job.
   *
   * Funding IS acceptance — the protocol has no accept message — so once the
   * covenant is funded the payment is committed and under way: the solver pays
   * the invoice and claims, and if it cannot, the covenant refunds without
   * needing anything further from us. Waiting here for the solver to finish
   * meant the user watched a spinner through the solver's whole pipeline
   * (notice the funding, route the payment, claim) for an outcome they cannot
   * influence and that resolves in their favour either way.
   *
   * The success screen says "on the way" rather than "sent" for exactly this
   * reason: at this instant the invoice is not paid yet, and the wording has to
   * match what is actually true.
   */
  const payLightning = async (request: LnSendRequest) => {
    const txid = await sendOffChain(svcWallet!, request.fundAmount, request.address)
    if (!txid) return handleError('Error sending transaction')
    // Record the covenant against the funding txid: it is the only handle on
    // the spend that ends this swap, and it stops being derivable the moment
    // this screen unmounts — the quote is gone and nothing else stores it.
    handleTxid(txid, { swapPkScript: request.swapPkScript })
  }

  const handleContinue = async () => {
    if (!details || !svcWallet) return
    // Surface these as errors instead of silently no-op'ing on tap: a "Tap to
    // Sign" that does nothing is indistinguishable from a broken button. The
    // net `satoshis` is the amount after deducting the onchain output fee, so a
    // zero here means the fee consumed the whole amount.
    if (!isAssetSend && !details.total) return handleError(t('errors.general.missingAmount'))
    if (!isAssetSend && !details.satoshis) return handleError(t('errors.network.tooLow'))
    if (isAssetSend && !arkAddress) {
      setError(t('errors.send.arkade.assets'))
      return
    }

    setSending(true)

    if (isAssetSend && arkAddress) {
      // Asset send via wallet.send()
      if (!sendInfo.assets || sendInfo.assets.length === 0) return handleError(t('errors.general.missingAssetList'))
      sendAssets(svcWallet, arkAddress, sendInfo.assets)
        .then((txId: string) => handleTxid(txId))
        .catch(handleError)
    } else if (arkAddress) {
      if (!details.total) return handleError(t('errors.general.missingTotal'))
      sendOffChain(svcWallet, details.total, arkAddress)
        .then((txId: string) => handleTxid(txId))
        .catch(handleError)
    } else if (invoice && pendingSwap && isPendingSubmarineSwap(pendingSwap)) {
      const swapAddress = pendingSwap.response.address
      if (!swapAddress) return handleError(t('errors.general.swapAddUnavailable'))
      payInvoice(pendingSwap)
        .then(({ preimage, txid }) => handlePreimage({ preimage, txid }))
        .catch(handleError)
    } else if (invoice && pendingLnSend) {
      // RFQ Lightning send. The address below is the wallet's OWN derivation
      // of the lockup covenant (the client refuses a mismatched quote), so
      // funding it IS the acceptance — no further message exists. The solver
      // observes the funding, pays the invoice, and claims with the preimage;
      // a failed swap refunds by covenant.
      if (Math.floor(Date.now() / 1000) >= pendingLnSend.validUntil) {
        return handleError('Quote expired — go back and try again')
      }
      payLightning(pendingLnSend).catch(handleError)
    } else if (address) {
      if (pendingSwap && isPendingChainSwap(pendingSwap)) {
        payBtc(pendingSwap)
          .then(({ txid }) => handleTxid(txid))
          .catch(handleError)
      } else {
        if (!details.total) return handleError(t('errors.general.missingTotal'))
        if (!details.satoshis) return handleError(t('errors.general.missingSats'))
        collaborativeExitWithFees(svcWallet, details.total, details.satoshis, address)
          .then((txId: string) => handleTxid(txId))
          .catch(handleError)
      }
    }
  }

  return (
    <>
      <Header text={t('common.general.signTrans')} back />
      <Content>
        {sending ? (
          details?.destination === invoice ? (
            <Loading text={t('common.directions.lightningPay')} />
          ) : details?.destination === arkAddress ? (
            <Loading text={t('common.directions.arkade')} />
          ) : (
            <Loading text={t('common.directions.mainnetPay')} />
          )
        ) : (
          <Padded>
            <FlexCol>
              <ErrorMessage error={Boolean(error)} text={error} />
              {isAssetSend ? (
                <FlexCol gap='0.5rem'>
                  <Text color='neutral-500' smaller testId='send-details-asset-name'>
                    {assetName} ({assetTicker})
                  </Text>
                  <Text bold testId='send-details-asset-amount'>
                    {prettyAssetAmount(assetAmountValue, assetMeta?.metadata?.decimals ?? 8)} {assetTicker}
                  </Text>
                </FlexCol>
              ) : null}
              <Details details={details} />
            </FlexCol>
          </Padded>
        )}
      </Content>
      <ButtonsOnBottom>
        {sending ? null : <Button onClick={handleContinue} label={buttonLabel} disabled={Boolean(error)} />}
      </ButtonsOnBottom>
    </>
  )
}
