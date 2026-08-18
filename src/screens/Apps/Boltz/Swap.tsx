import { useCallback, useContext, useEffect, useState } from 'react'
import Padded from '../../../components/Padded'
import Header from '../../../components/Header'
import Content from '../../../components/Content'
import FlexCol from '../../../components/FlexCol'
import Table, { TableData } from '../../../components/Table'
import { FlowContext } from '../../../providers/flow'
import { decodeInvoice, isValidInvoice } from '../../../lib/bolt11'
import { prettyAgo, prettyAmount, prettyDate, prettyHide } from '../../../lib/format'
import { ConfigContext } from '../../../providers/config'
import {
  isSubmarineSwapRefundable,
  isChainSwapRefundable,
  isReverseSwapClaimable,
  isChainSwapClaimable,
} from '@arkade-os/boltz-swap'
import Button from '../../../components/Button'
import ButtonsOnBottom from '../../../components/ButtonsOnBottom'
import { SwapsContext } from '../../../providers/swaps'
import { consoleError } from '../../../lib/logs'
import { extractError } from '../../../lib/error'
import ErrorMessage from '../../../components/Error'
import { TextSecondary } from '../../../components/Text'
import CheckMarkIcon from '../../../icons/CheckMark'
import Info from '../../../components/Info'
import LoadingLogo from '../../../components/LoadingLogo'
import FlexRow from '../../../components/FlexRow'
import { InfoIconDark } from '../../../icons/Info'
import {useTranslation} from 'react-i18next'

function friendlySwapError(message: string): string {
  const locktimeMatch = message.match(/locktime=(\d+)/)
  const {t} = useTranslation()
  if (locktimeMatch) {
    const date = prettyDate(parseInt(locktimeMatch[1], 10))
    return t('apps.boltz.unvavailableRefund', {date: date})
  }
  if (message.includes(t('apps.boltz.VHTLCspent'))) {
    return t('apps.boltz.swapSpent')
  }
  if (message.includes(t('apps.boltz.VHTLCnf'))) {
    return t('apps.boltz.noFundsSwap')
  }
  return message
}

export default function AppBoltzSwap() {
  const { config } = useContext(ConfigContext)
  const { swapInfo, setSwapInfo } = useContext(FlowContext)
  const { claimArk, claimBtc, claimVHTLC, refundArk, refundVHTLC, swapManager } = useContext(SwapsContext)

  const [error, setError] = useState<string>('')
  const [processing, setProcessing] = useState<boolean>(false)
  const [opDone, setOpDone] = useState(false)
  const [success, setSuccess] = useState<boolean>(false)

  // Subscribe to real-time updates for this swap. subscribeToSwapUpdates
  // is now async (Promise<() => void>) and the callback may emit chain
  // swaps — which FlowContext's SwapInfo doesn't model, so ignore them.
  useEffect(() => {
    if (!swapManager || !swapInfo) return

    let unsub: (() => void) | null = null
    let cancelled = false
    swapManager
      .subscribeToSwapUpdates(swapInfo.id, (updatedSwap) => {
        setSwapInfo(updatedSwap)
      })
      .then((unsubscribe) => {
        if (cancelled) {
          unsubscribe()
        } else {
          unsub = unsubscribe
        }
      })

    return () => {
      cancelled = true
      unsub?.()
    }
  }, [swapManager, swapInfo?.id])

  if (!swapInfo) return null

  const formatAmount = (amt: number | undefined) => {
    if (amt === undefined || Number.isNaN(amt)) return '—'
    return config.showBalance ? prettyAmount(amt) : prettyHide(amt)
  }

  const diff = (a: number | undefined, b: number | undefined) =>
    a === undefined || b === undefined ? undefined : a - b

  const date = prettyDate(swapInfo.createdAt)
  const when = prettyAgo(swapInfo.createdAt)
  const swapId = swapInfo.response.id
  const preimage = swapInfo.preimage
  const status = swapInfo.status

  const {t} = useTranslation()

  let tableData: TableData = []

  if (swapInfo.type === 'chain') {
    const sentSats = swapInfo.response.lockupDetails?.amount
    const rcvdSats = swapInfo.response.claimDetails?.amount
    const btcAddress =
      swapInfo.request.from === 'ARK' ? swapInfo.toAddress : swapInfo.response.claimDetails?.lockupAddress

    tableData = [
      [t('apps.boltz.'), when],
      [t('apps.boltz.kind'), t('apps.boltz.chainS')],
      [t('apps.boltz.swapId'), swapId],
      [t('apps.boltz.direction'), swapInfo.request.from === 'ARK' ? 'Arkade to BTC' : 'BTC to Arkade'],
      [t('apps.boltz.date'), date],
      [t('apps.boltz.preimage'), preimage],
      [t('apps.boltz.btcAd'), btcAddress],
      [t('apps.boltz.status'), status],
      [t('apps.boltz.amount'), formatAmount(rcvdSats)],
      [t('apps.boltz.fees'), formatAmount(diff(sentSats, rcvdSats))],
      [t('apps.boltz.total'), formatAmount(sentSats)],
    ]
  } else if (swapInfo.type === 'reverse') {
    const sentSats = swapInfo.request.invoiceAmount
    const rcvdSats = swapInfo.response.onchainAmount

    tableData = [
      [t('apps.boltz.when'), when],
      [t('apps.boltz.kind'), t('apps.boltz.reverseS')],
      [t('apps.boltz.swapId'), swapId],
      [t('apps.boltz.direction'), 'Lightning to Arkade'],
      [t('apps.boltz.date'), date],
      [t('apps.boltz.preimage'), preimage],
      [t('apps.boltz.invoice'), swapInfo.response.invoice],
      [t('apps.boltz.status'), swapInfo.status],
      [t('apps.boltz.amount'), formatAmount(rcvdSats)],
      [t('apps.boltz.fees'), formatAmount(diff(sentSats, rcvdSats))],
      [t('apps.boltz.total'), formatAmount(sentSats)],
    ]
  } else if (swapInfo.type === 'submarine') {
    const sentSats = swapInfo.response.expectedAmount
    const rcvdSats = isValidInvoice(swapInfo.request.invoice)
      ? decodeInvoice(swapInfo.request.invoice).amountSats
      : undefined

    tableData = [
      [t('apps.boltz.when'), when],
      [t('apps.boltz.kind'), 'Submarine Swap'],
      [t('apps.boltz.swapId'), swapId],
      [t('apps.boltz.direction'), 'Arkade to Lightning'],
      [t('apps.boltz.date'), date],
      [t('apps.boltz.preimage'), preimage],
      [t('apps.boltz.invoice'), swapInfo.request.invoice],
      [t('apps.boltz.status'), status],
      [t('apps.boltz.amount'), formatAmount(rcvdSats)],
      [t('apps.boltz.fees'), formatAmount(diff(sentSats, rcvdSats))],
      [t('apps.boltz.total'), formatAmount(sentSats)],
    ]
  }

  const isRefundable = isSubmarineSwapRefundable(swapInfo) || isChainSwapRefundable(swapInfo)
  const isClaimable = isReverseSwapClaimable(swapInfo) || isChainSwapClaimable(swapInfo)
  const buttonLabel = isClaimable ? t('apps.boltz.complS') : t('apps.boltz.refundS')
  const refunded = swapInfo.status === 'transaction.refunded'

  const buttonHandler = async () => {
    try {
      setProcessing(true)
      if (isReverseSwapClaimable(swapInfo)) {
        await claimVHTLC(swapInfo)
        setSuccess(true)
      }
      if (isChainSwapClaimable(swapInfo)) {
        if (swapInfo.request.to === 'BTC') {
          await claimBtc(swapInfo)
        } else if (swapInfo.request.to === 'ARK') {
          await claimArk(swapInfo)
        }
        setSuccess(true)
      }
      if (isChainSwapRefundable(swapInfo)) {
        await refundArk(swapInfo)
        setSuccess(true)
      }
      if (isSubmarineSwapRefundable(swapInfo)) {
        await refundVHTLC(swapInfo)
        setSuccess(true)
      }
      // No need to manually refresh - SwapManager handles status updates
      setOpDone(true)
    } catch (error) {
      const raw = extractError(error)
      setError(friendlySwapError(raw))
      consoleError(error, `Error processing swap ${swapInfo?.id}`)
      setProcessing(false)
    }
  }

  const handleExitComplete = useCallback(() => {
    setProcessing(false)
  }, [])

  return (
    <>
      <Header text={t('apps.boltz.swap')} back />
      <Content>
        <Padded>
          {processing ? (
            <LoadingLogo
              text={t('apps.boltz.processing')}
              done={opDone}
              exitMode='fly-up'
              onExitComplete={handleExitComplete}
            />
          ) : (
            <FlexCol gap='2rem'>
              <ErrorMessage error={Boolean(error)} text={error} />
              {success ? (
                <Info color='green' icon={<CheckMarkIcon small />} title={t('common.general.success')}>
                  <TextSecondary>Swap {isRefundable ?t('apps.boltz.refunded') : t('apps.boltz.completed')}</TextSecondary>
                </Info>
              ) : refunded ? (
                <FlexRow alignItems='flex-start'>
                  <InfoIconDark color='green' />
                  <TextSecondary>{t('apps.boltz.swapRef')}</TextSecondary>
                </FlexRow>
              ) : null}
              <Table data={tableData} />
            </FlexCol>
          )}
        </Padded>
      </Content>
      {!success && (isRefundable || isClaimable) ? (
        <ButtonsOnBottom>
          <Button onClick={buttonHandler} label={buttonLabel} disabled={processing} />
        </ButtonsOnBottom>
      ) : null}
    </>
  )
}
