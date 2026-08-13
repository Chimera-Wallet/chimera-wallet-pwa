import { useContext, useEffect, useState } from 'react'
import Button from '../../components/Button'
import ButtonsOnBottom from '../../components/ButtonsOnBottom'
import Padded from '../../components/Padded'
import { WalletContext } from '../../providers/wallet'
import { FlowContext } from '../../providers/flow'
import { isBurn, isIssuance, prettyAgo, prettyDate } from '../../lib/format'
import { defaultFee } from '../../lib/constants'
import ErrorMessage from '../../components/Error'
import { extractError } from '../../lib/error'
import Header from '../../components/Header'
import Content from '../../components/Content'
import Info from '../../components/Info'
import FlexCol from '../../components/FlexCol'
import FlexRow from '../../components/FlexRow'
import { sleep } from '../../lib/sleep'
import Text, { TextSecondary } from '../../components/Text'
import AssetAvatar from '../../components/AssetAvatar'
import Details, { DetailsProps } from '../../components/Details'
import VtxosIcon from '../../icons/Vtxos'
import CheckMarkIcon from '../../icons/CheckMark'
import LoadingIcon from '../../icons/Loading'
import { AspContext } from '../../providers/asp'
import Reminder from '../../components/Reminder'
import { LimitsContext } from '../../providers/limits'
import { getInputsToSettle } from '../../lib/asp'
import { prettyAssetAmount } from '../../lib/assets'
import {useTranslation} from 'react-i18next'

export default function Transaction() {
  const { utxoTxsAllowed, vtxoTxsAllowed } = useContext(LimitsContext)
  const { txInfo } = useContext(FlowContext)
  const { aspInfo, calcBestMarketHour } = useContext(AspContext)
  const { assetMetadataCache, settlePreconfirmed, vtxos, vtxoManager, wallet, svcWallet } = useContext(WalletContext)

  const {t} = useTranslation()

  const tx = txInfo
  const issuanceTx = tx ? isIssuance(tx) : false
  const burnTx = tx ? isBurn(tx) : false
  const boardingTx = Boolean(tx?.boardingTxid)
  const defaultButtonLabel = boardingTx ? t('networks.transactions.completeBoarding') : t('networks.transactions.settleTransaction')
  const boardingExitDelay = Number(aspInfo?.boardingExitDelay || 0)
  const unconfirmedBoardingTx = boardingTx && !tx?.createdAt
  const expiredBoardingTx =
    !tx?.settled && boardingTx && tx?.createdAt && Date.now() / 1000 - tx?.createdAt > boardingExitDelay

  const [buttonLabel, setButtonLabel] = useState(defaultButtonLabel)
  const [amountAboveDust, setAmountAboveDust] = useState(false)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState('')
  const [hasInputsToSettle, setHasInputsToSettle] = useState(false)
  const [reminderIsOpen, setReminderIsOpen] = useState(false)
  const [settleSuccess, setSettleSuccess] = useState(false)
  const [resending, setResending] = useState(false)
  const [settling, setSettling] = useState(false)
  const [startTime, setStartTime] = useState(0)

  // Hide status banners while settling or after success to prevent conflicting UI states
  const hideStatusBanners = settling || settleSuccess

  useEffect(() => {
    setButtonLabel(settling ? t('networks.transactions.settling') : defaultButtonLabel)
  }, [settling, defaultButtonLabel])

  useEffect(() => {
    if (!tx) return
    const bestMarketHour = calcBestMarketHour(wallet.nextRollover)
    if (bestMarketHour) {
      setStartTime(Number(bestMarketHour.nextStartTime))
      setDuration(Number(bestMarketHour.duration))
    } else {
      setStartTime(wallet.nextRollover)
      setDuration(0)
    }
  }, [wallet.nextRollover])

  useEffect(() => {
    if (!aspInfo || !svcWallet || !vtxoManager) return
    getInputsToSettle(svcWallet, vtxoManager, wallet.thresholdMs).then(({ inputs }) => {
      setHasInputsToSettle(inputs.length > 0)
      const totalAmount = inputs.reduce((a, v) => a + v.value, 0) || 0
      setAmountAboveDust(totalAmount > aspInfo.dust)
    })
  }, [aspInfo, vtxos, svcWallet, vtxoManager, wallet.thresholdMs])

  // TODO implement resend
  //  - create new boarding tx
  //  - update txInfo with new boarding txid
  //  - show message that new boarding tx has been created
  //  - if error, show error message
  const handleResend = async () => {
    setResending(true)
  }

  const handleSettle = async () => {
    setError('')
    setSettling(true)
    try {
      await settlePreconfirmed()
      await sleep(2000) // give time to read last message
      setSettleSuccess(true)
      // Note: We don't optimistically update txInfo here because:
      // 1. The wallet will reload and reflect the settled state automatically
      // 2. Updating txInfo after an async operation can corrupt navigation if
      //    the user has navigated to a different transaction
    } catch (err) {
      setError(extractError(err))
    }
    setSettling(false)
  }

  if (!tx) return <></>

  const details: DetailsProps = {
    direction: issuanceTx ? 'Issuance' : burnTx ? 'Burn' : tx.type === 'sent' ? t('common.general.sent') : t('common.general.received'),
    when: tx.createdAt ? prettyAgo(tx.createdAt) : !unconfirmedBoardingTx ? t('common.general.unkown') : t('common.general.unconfirmed'),
    date: tx.createdAt ? prettyDate(tx.createdAt) : !unconfirmedBoardingTx ? t('common.general.unkown') : t('common.general.unconfirmed'),
    status:
      settleSuccess || tx.settled
        ? t('common.general.settled')
        : expiredBoardingTx
          ? t('common.general.expired')
          : unconfirmedBoardingTx
            ? t('common.general.unconfirmed')
            : boardingTx && tx.preconfirmed
              ? t('networks.transactions.pendingBoarding')
              : t('networks.transactions.preconfirmed'),
    type: boardingTx ? t('networks.transactions.boarding') : t('networks.transactions.offchain'),
    txid: tx.boardingTxid || tx.redeemTxid || '',
    isOffchainTx: !tx.boardingTxid && Boolean(tx.redeemTxid),
    assetId: tx.assets?.[0]?.assetId,
    wallet: wallet,
    satoshis: tx.type === 'sent' ? tx.amount - defaultFee : tx.amount,
    fees: tx.type === 'sent' ? defaultFee : 0,
    total: tx.amount,
  }

  const Body = () => (
    <Content>
      <Padded>
        <FlexCol>
          <ErrorMessage error={Boolean(error)} text={error} />
          {settling ? (
            <Info color='purpletext' icon={<LoadingIcon small />} title={t('networks.transactions.settling')}>
              <Text wrap>{boardingTx ? t('networks.transactions.processingBoarding') : t('networks.transactions.settlingTransaction')}</Text>
            </Info>
          ) : null}
          {expiredBoardingTx && !hideStatusBanners ? (
            <Info color='red' icon={<VtxosIcon />} title={t('common.general.expired')}>
              <Text wrap>{t('networks.transactions.boardingExpired')}</Text>
            </Info>
          ) : unconfirmedBoardingTx ? (
            <Info color='orange' icon={<VtxosIcon />} title={t('common.general.unconfirmed')}>
              <Text wrap>{t('networks.transactions.onchainUnconfirmed')}.</Text>
            </Info>
          ) : tx.preconfirmed && tx.boardingTxid && !hideStatusBanners ? (
            <Info color='orange' icon={<VtxosIcon />} title={t('networks.transactions.pendingBoarding')}>
              <Text wrap>{t('networks.transactions.onboardConfirmed')}</Text>
            </Info>
          ) : null}
          {settleSuccess ? (
            <Info color='green' icon={<CheckMarkIcon small />} title={t('common.general.success')}>
              <TextSecondary>{t('networks.transactions.transactionSettledSucc')}</TextSecondary>
            </Info>
          ) : null}
          {tx.assets?.length ? (
            <FlexCol gap='0.5rem'>
              {tx.assets.map((a) => {
                const meta = assetMetadataCache.get(a.assetId)?.metadata
                const ticker = meta?.ticker
                const name = meta?.name
                const icon = meta?.icon
                const decimals = meta?.decimals ?? 8
                const color = tx.type === 'received' || issuanceTx ? 'green' : ''
                const label = ticker ?? name ?? `${a.assetId.slice(0, 8)}...`
                return (
                  <FlexRow key={a.assetId} gap='0.5rem'>
                    <AssetAvatar icon={icon} ticker={ticker} size={32} assetId={a.assetId} clickable />
                    <FlexCol gap='0'>
                      <Text color={color}>
                        {prettyAssetAmount(a.amount, decimals)} {label}
                      </Text>
                      {name && ticker ? <TextSecondary>{name}</TextSecondary> : null}
                    </FlexCol>
                  </FlexRow>
                )
              })}
            </FlexCol>
          ) : null}
          <Details details={details} />
        </FlexCol>
      </Padded>
    </Content>
  )

  // if server defines that UTXO transactions are not allowed,
  // don't allow settlement since it is a UTXO transaction.
  const showSettleButtons =
    utxoTxsAllowed() &&
    vtxoTxsAllowed() &&
    !unconfirmedBoardingTx &&
    !expiredBoardingTx &&
    hasInputsToSettle &&
    amountAboveDust &&
    !settleSuccess &&
    !tx.settled &&
    !settling

  const Buttons = () =>
    expiredBoardingTx && !hideStatusBanners ? (
      <ButtonsOnBottom>
        <Button onClick={handleResend} label={t('networks.transactions.resend')} disabled={resending || true} />
      </ButtonsOnBottom>
    ) : showSettleButtons ? (
      <>
        <ButtonsOnBottom>
          <Button onClick={handleSettle} label={buttonLabel} disabled={settling} />
          <Button onClick={() => setReminderIsOpen(true)} label={t('networks.transaction.reminder')} secondary />
        </ButtonsOnBottom>
        <Reminder
          isOpen={reminderIsOpen}
          callback={() => setReminderIsOpen(false)}
          duration={duration}
          name={t('networks.transaction.settleTransaction')}
          startTime={startTime}
        />
      </>
    ) : null

  return (
    <>
      <Header text={t('networks.transaction.transaction')} back />
      <Body />
      <Buttons />
    </>
  )
}
