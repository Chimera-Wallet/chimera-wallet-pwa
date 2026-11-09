import { useContext, useState, useSyncExternalStore } from 'react'
import Padded from '../../components/Padded'
import { WalletContext } from '../../providers/wallet'
import { FlowContext } from '../../providers/flow'
import { isBurn, isIssuance, prettyAgo, prettyDate } from '../../lib/format'
import { defaultFee } from '../../lib/constants'
import Header from '../../components/Header'
import Content from '../../components/Content'
import Info from '../../components/Info'
import FlexCol from '../../components/FlexCol'
import FlexRow from '../../components/FlexRow'
import Text, { TextSecondary } from '../../components/Text'
import AssetAvatar from '../../components/AssetAvatar'
import Details, { DetailsProps } from '../../components/Details'
import VtxosIcon from '../../icons/Vtxos'
import { AspContext } from '../../providers/asp'
import { prettyAssetAmount } from '../../lib/assets'
import { getTxStatus, TX_STATUS_DISPLAY } from '../../lib/txStatus'
import { AssetSwapsContext } from '../../providers/assetSwaps'
import Button from '../../components/Button'
import ErrorMessage from '../../components/Error'
import { extractError } from '../../lib/error'
import { Tx } from '../../lib/types'
import {useTranslation} from 'react-i18next'
import { useLnSendReceipt } from '../../hooks/useLnSendReceipt'
import UnverifiedBadge from '../../components/UnverifiedBadge'
import EditableNote from '../../components/NoteEditor'
import { getTxNote, setTxNote, subscribeTxNotes, txNoteKey } from '../../lib/txNotes'
import { buildWrapTx, getWrapDeposits, subscribeWrapDeposits } from '../../lib/wrapDeposits'
import { SOURCE_CHAINS, type SourceChainId } from '../../lib/sourceChains'

const sameTx = (a: Tx, b: Tx): boolean => {
  if (a.type !== b.type) return false
  if (a.wrap) return a.wrap.quoteId === b.wrap?.quoteId
  if (a.boardingTxid) return a.boardingTxid === b.boardingTxid
  if (a.redeemTxid) return a.redeemTxid === b.redeemTxid
  return Boolean(a.roundTxid) && a.roundTxid === b.roundTxid
}

// No settle / "Complete boarding" buttons here on purpose: deposits board
// automatically on app start and pull-to-refresh (WalletContext.boardDeposits),
// so this screen only reports status.
export default function Transaction() {
  const { txInfo } = useContext(FlowContext)
  const { aspInfo } = useContext(AspContext)
  const { assetMetadataCache, txs, wallet, isAssetVerified } = useContext(WalletContext)

  const {t} = useTranslation()

  // txInfo is a snapshot taken when the row was tapped. Follow the live entry
  // so the status updates when the wallet reloads (e.g. once a deposit boards).
  // A pending bridge deposit isn't a wallet tx; follow it in its own store.
  const wrapDeposits = useSyncExternalStore(subscribeWrapDeposits, getWrapDeposits)
  const wrapDeposit = txInfo?.wrap ? wrapDeposits.find((d) => d.quote.id === txInfo.wrap!.quoteId) : undefined
  const tx =
    (wrapDeposit && buildWrapTx(wrapDeposit)) ??
    (txInfo && txs.find((candidate) => sameTx(txInfo, candidate))) ??
    txInfo
  const issuanceTx = tx ? isIssuance(tx) : false
  const burnTx = tx ? isBurn(tx) : false
  const boardingTx = Boolean(tx?.boardingTxid)
  const boardingExitDelay = Number(aspInfo?.boardingExitDelay || 0)
  const lnSendReceipt = useLnSendReceipt(tx)
  const noteKey = tx ? txNoteKey(tx) : undefined
  const note = useSyncExternalStore(subscribeTxNotes, () => getTxNote(noteKey))
  const { swaps, cancelSwap } = useContext(AssetSwapsContext)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')

  // Read the stored record, not the row: the row folds `cancelling` into
  // `pending`, and only a deposit still waiting for a fill can be cancelled
  // (a `recoverable` one was swept and has no cooperative path left).
  const swapRecord = tx?.assetSwap ? swaps.find((s) => s.id === tx.assetSwap!.id) : undefined
  const canCancelSwap = swapRecord?.status === 'pending'

  const handleCancelSwap = () => {
    if (!swapRecord) return
    setCancelError('')
    setCancelling(true)
    cancelSwap(swapRecord.id)
      .catch((err) => setCancelError(extractError(err)))
      .finally(() => setCancelling(false))
  }

  if (!tx) return <></>
  const txid = tx.boardingTxid || tx.redeemTxid || tx.roundTxid || ''
  const txStatus = getTxStatus(tx, boardingExitDelay)
  const statusLabel = t(TX_STATUS_DISPLAY[txStatus].text)
  const wrapChain = tx.wrap ? SOURCE_CHAINS[tx.wrap.chain as SourceChainId] : undefined


  const details: DetailsProps = {
    direction: issuanceTx ? 'Issuance' : burnTx ? 'Burn' : tx.type === 'sent' ? t('common.general.sent') : t('common.general.received'),
    when: tx.createdAt ? prettyAgo(tx.createdAt) : txStatus !== 'Unconfirmed' ? t('common.general.unkown') : t('common.general.unconfirmed'),
    date: tx.createdAt ? prettyDate(tx.createdAt) : txStatus !== 'Unconfirmed' ? t('common.general.unkown') : t('common.general.unconfirmed'),
    status: statusLabel,
    type: wrapChain ? wrapChain.name : boardingTx ? t('networks.transactions.boarding') : t('networks.transactions.offchain'),
    isOffchainTx: !tx.boardingTxid && Boolean(tx.redeemTxid),
    assetId: tx.assets?.[0]?.assetId,
    wallet: wallet,
    satoshis: tx.type === 'sent' ? tx.amount - defaultFee : tx.amount,
    fees: tx.type === 'sent' ? defaultFee : 0,
    total: tx.amount,
    // A Lightning send is two txs, so it gets the same pair of rows an
        // asset swap does — funding, then the spend that ended it — in place
        // of a lone "Transaction ID" that would name only the first and say
        // nothing about whether the invoice was ever paid. Dropping txid is
        // how the swap branch above expresses the same thing.
    ...lnSendReceipt,
    txid: lnSendReceipt ? undefined : txid,
    // A bridge deposit has no BTC leg and no Arkade tx yet, so none of the
    // sats rows apply.
    ...(tx.wrap ? { satoshis: undefined, fees: undefined, total: undefined } : {}),
  }

  return (
    <>
      <Header text={t('networks.transactions.transaction')} back />
      <Content>
        <Padded>
          <FlexCol>
            {txStatus === 'Expired' ? (
              <Info color='red' icon={<VtxosIcon />} title={statusLabel}>
                <Text wrap>{t('networks.transactions.boardingExpired')}</Text>
              </Info>
            ) : txStatus === 'Unconfirmed' ? (
              <Info color='orange' icon={<VtxosIcon />} title={statusLabel}>
                <Text wrap>{t('networks.transactions.onchainUnconfirmed')}</Text>
              </Info>
            ) : txStatus === 'Pending boarding' ? (
              <Info color='orange' icon={<VtxosIcon />} title={statusLabel}>
                <Text wrap>{t('networks.transactions.boardingAutomatically')}</Text>
              </Info>
            ) : tx.wrap && (txStatus === 'Wrapping' || txStatus === 'Wrap failed') ? (
              <Info color={txStatus === 'Wrapping' ? 'orange' : 'red'} icon={<VtxosIcon />} title={statusLabel}>
                <Text wrap>{t(`common.notifications.wrapService.${tx.wrap.status}`)}</Text>
              </Info>
            ) : null}
            {canCancelSwap || cancelling ? (
              <Info color='orange' icon={<VtxosIcon />} title={t('apps.swap.cancelPendingTitle')}>
                <Text wrap>{t('apps.swap.cancelPendingDesc')}</Text>
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
                        {!isAssetVerified(a.assetId) ? <UnverifiedBadge /> : null}
                      </FlexCol>
                    </FlexRow>
                  )
                })}
              </FlexCol>
            ) : null}
            {noteKey ? (
              <EditableNote
                value={note}
                onSave={(text) => setTxNote(noteKey, text)}
                placeholder={t('components.note.txPlaceholder')}
                testId='tx-note'
              />
            ) : null}
            <Details details={details} />
            {cancelError ? <ErrorMessage error text={cancelError} /> : null}
            {canCancelSwap || cancelling ? (
              <Button
                label={t('apps.swap.cancelSwap')}
                onClick={handleCancelSwap}
                loading={cancelling}
                disabled={cancelling}
                red
                testId='cancel-swap'
              />
            ) : null}
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
