import { useContext } from 'react'
import { prettyAmount, prettyFiatAmount, prettyFiatHide, prettyHide } from '../lib/format'
import { ConfigContext } from '../providers/config'
import { FiatContext } from '../providers/fiat'
import FeesIcon from '../icons/Fees'
import AmountIcon from '../icons/Amount'
import TotalIcon from '../icons/Total'
import DateIcon from '../icons/Date'
import DirectionIcon from '../icons/Direction'
import TypeIcon from '../icons/Type'
import WhenIcon from '../icons/When'
import NotesIcon from '../icons/Notes'
import Table, { TableData } from './Table'
import StatusIcon from '../icons/Status'
import HashIcon from '../icons/Hash'
import InfoIcon from '../icons/Info'
import { Wallet } from '../lib/types'
import {
  openInNewTab,
  openOffchainTxInNewTab,
  openAssetInNewTab,
  getOffchainTxURL,
  getAssetURL,
} from '../lib/explorers'
import { useTranslation } from 'react-i18next'

export interface DetailsProps {
  address?: string
  arknote?: string
  assetId?: string
  date?: string
  destination?: string
  direction?: string
  expiry?: string
  fees?: number
  invoice?: string
  isOffchainTx?: boolean
  satoshis?: number
  status?: string
  swapId?: string
  total?: number
  txid?: string
  type?: string
  wallet?: Wallet
  when?: string
}

export default function Details({ details }: { details?: DetailsProps }) {
  const { config, useFiat } = useContext(ConfigContext)
  const { toFiat } = useContext(FiatContext)
  const {t} = useTranslation()

  if (!details) return <></>

  const {
    address,
    arknote,
    assetId,
    date,
    direction,
    destination,
    expiry,
    fees,
    invoice,
    isOffchainTx,
    satoshis,
    status,
    swapId,
    txid,
    type,
    total,
    wallet,
    when,
  } = details

  const formatAmount = (amount?: number) => {
    if (amount === undefined) return ''
    if (useFiat) {
      const fiat = toFiat(amount)
      return config.showBalance ? prettyFiatAmount(fiat, config.fiat) : prettyFiatHide(fiat, config.fiat)
    }
    return config.showBalance ? prettyAmount(amount) : prettyHide(amount)
  }

  // Only show explorer link if URL is available (e.g., mainnet for vmempool)
  const txidOnClick =
    wallet && txid
      ? () => {
          if (isOffchainTx) {
            openOffchainTxInNewTab(txid, wallet)
          } else {
            openInNewTab(txid, wallet)
          }
        }
      : undefined

  // Hide offchain tx link if vmempool URL not configured for this network
  const showTxidLink = txidOnClick && (!isOffchainTx || getOffchainTxURL(txid ?? '', wallet!))

  const assetIdOnClick =
    wallet && assetId && getAssetURL(assetId, wallet)
      ? () => {
          openAssetInNewTab(assetId, wallet)
        }
      : undefined

  const data: TableData = [
    [t('components.details.addr'), address, <TypeIcon key='address-icon' />],
    [t('components.details.arkNote'), arknote, <NotesIcon key='notes-icon' small />],
    [t('components.details.inv'), invoice, <TypeIcon key='invoice-icon' />],
    [t('components.details.swapId'), swapId, <InfoIcon key='swap-id-icon' />],
    [t('components.details.dest'), destination, <TypeIcon key='destination-icon' />],
    [t('components.details.transId'), txid, <HashIcon key='txid-icon' />, showTxidLink ? txidOnClick : undefined],
    [t('components.details.assId'), assetId, <InfoIcon key='asset-id-icon' />, assetIdOnClick],
    [t('components.details.dir'), direction, <DirectionIcon key='direction-icon' />],
    [t('components.details.ty'), type, <TypeIcon key='type-icon' />],
    [t('components.details.stat'), status, <StatusIcon key='status-icon' />],
    [t('components.details.when'), when, <WhenIcon key='when-icon' />],
    [t('components.details.date'), date, <DateIcon key='date-icon' />],
    [t('components.details.exp'), expiry, <DateIcon key='expiry-icon' />],
    [t('components.details.am'), formatAmount(satoshis), <AmountIcon key='amount-icon' />],
    [t('components.details.netFee'), formatAmount(fees), <FeesIcon key='fees-icon' />],
    [t('components.details.total'), formatAmount(total), <TotalIcon key='total-icon' />],
  ]

  return <Table data={data} />
}
