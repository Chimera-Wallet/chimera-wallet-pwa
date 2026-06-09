import { BoltzSwap } from '@arkade-os/boltz-swap'
import { ReactNode, createContext, useState } from 'react'
import type { Asset, AssetDetails } from '@arkade-os/sdk'
import { Tx } from '../lib/types'
import type { TransferMethod } from '../lib/transferMethods'
import { ChimeraOrder } from './chimera'
import { DEFAULT_BANK_CURRENCY, DEFAULT_BANK_CIRCUIT, type BankCircuit, type BankCurrency, type BankData } from '../lib/bankTransferConfig'
export type { TransferMethod } from '../lib/transferMethods'

export interface InitInfo {
  password?: string
  privateKey?: Uint8Array
  mnemonic?: string
  restoring?: boolean
  backupDone?: boolean
}

export interface NoteInfo {
  note: string
  satoshis: number
}

export interface DeepLinkInfo {
  appId: string
  query?: string
}

export interface KycAuthParams {
  uid: string
  code: string
  type?: string
}

export interface RecvInfo {
  boardingAddr: string
  offchainAddr: string
  onchainAddr?: string
  invoice?: string
  method?: TransferMethod
  satoshis: number
  txid?: string
  addressError?: string
  assetId?: string
  assetAmount?: bigint
  receivedAssets?: Asset[]
  received: boolean
}

// Bank Receive (Deposit) Info - for fiat → crypto
export interface BankRecvInfo {
  currency: BankCurrency
  circuit: BankCircuit
  amount: number
  order?: ChimeraOrder
}

// Bank Send (Withdraw) Info - for crypto → fiat
export interface BankSendInfo {
  currency: BankCurrency
  circuit: BankCircuit
  amount: number
  bankData?: BankData
  order?: ChimeraOrder
}

// Bank Order Type - track which order is currently active
export type BankOrderType = 'receive' | 'send'

export type SendInfo = {
  address?: string
  assets?: Asset[]
  arkAddress?: string
  invoice?: string
  lnUrl?: string
  pendingSwap?: BoltzSwap
  method?: TransferMethod
  recipient?: string
  satoshis?: number
  swapId?: string
  total?: number
  text?: string
  txid?: string
}

export type SwapInfo = BoltzSwap | undefined

export type SwapOrderInfo = ChimeraOrder | undefined

export type TxInfo = Tx | undefined

export type LnUrlInfo = Uint8Array | undefined

interface FlowContextProps {
  initInfo: InitInfo
  kycAuthParams: KycAuthParams | undefined
  noteInfo: NoteInfo
  deepLinkInfo: DeepLinkInfo | undefined
  recvInfo: RecvInfo
  sendInfo: SendInfo
  swapInfo: SwapInfo
  swapOrderInfo: SwapOrderInfo
  txInfo: TxInfo
  bankRecvInfo: BankRecvInfo
  bankSendInfo: BankSendInfo
  bankStatusOrder: ChimeraOrder | undefined
  currentBankOrderType?: BankOrderType
  setInitInfo: (arg0: InitInfo) => void
  setKycAuthParams: (arg0: KycAuthParams | undefined) => void
  setNoteInfo: (arg0: NoteInfo) => void
  setDeepLinkInfo: (arg0: DeepLinkInfo) => void
  setRecvInfo: (arg0: RecvInfo) => void
  setSendInfo: (arg0: SendInfo) => void
  setSwapInfo: (arg0: SwapInfo) => void
  setSwapOrderInfo: (arg0: SwapOrderInfo) => void
  setTxInfo: (arg0: TxInfo) => void
  assetInfo: AssetDetails
  setAssetInfo: (arg0: AssetDetails) => void
  lnurlInfo: LnUrlInfo
  setLnurlInfo: (arg0: LnUrlInfo) => void
  setBankRecvInfo: (arg0: BankRecvInfo) => void
  setBankSendInfo: (arg0: BankSendInfo) => void
  setBankStatusOrder: (order: ChimeraOrder | undefined) => void
  setCurrentBankOrderType: (type: BankOrderType | undefined) => void
}

export const emptyInitInfo: InitInfo = {
  password: undefined,
  privateKey: undefined,
}

export const emptyNoteInfo: NoteInfo = {
  note: '',
  satoshis: 0,
}

export const emptyRecvInfo: RecvInfo = {
  boardingAddr: '',
  offchainAddr: '',
  received: false,
  method: 'bitcoin',
  satoshis: 0,
}

export const emptyAssetInfo: AssetDetails = { assetId: '', supply: BigInt(0) }

export const emptySendInfo: SendInfo = {
  address: '',
  arkAddress: '',
  method: 'bitcoin',
  recipient: '',
  satoshis: 0,
  total: 0,
  txid: '',
}

export const emptyBankRecvInfo: BankRecvInfo = {
  currency: DEFAULT_BANK_CURRENCY,
  circuit: DEFAULT_BANK_CIRCUIT,
  amount: 0,
}

export const emptyBankSendInfo: BankSendInfo = {
  currency: DEFAULT_BANK_CURRENCY,
  circuit: DEFAULT_BANK_CIRCUIT,
  amount: 0,
}

export const FlowContext = createContext<FlowContextProps>({
  initInfo: emptyInitInfo,
  kycAuthParams: undefined,
  noteInfo: emptyNoteInfo,
  deepLinkInfo: undefined,
  recvInfo: emptyRecvInfo,
  sendInfo: emptySendInfo,
  swapInfo: undefined,
  swapOrderInfo: undefined,
  txInfo: undefined,
  bankRecvInfo: emptyBankRecvInfo,
  bankSendInfo: emptyBankSendInfo,
  bankStatusOrder: undefined,
  currentBankOrderType: undefined,
  setInitInfo: () => {},
  setKycAuthParams: () => {},
  setNoteInfo: () => {},
  setDeepLinkInfo: () => {},
  setRecvInfo: () => {},
  setSendInfo: () => {},
  setSwapInfo: () => {},
  setSwapOrderInfo: () => {},
  setTxInfo: () => {},
  assetInfo: emptyAssetInfo,
  setAssetInfo: () => {},
  lnurlInfo: undefined,
  setLnurlInfo: () => {},
  setBankRecvInfo: () => {},
  setBankSendInfo: () => {},
  setBankStatusOrder: () => {},
  setCurrentBankOrderType: () => {},
})

export const FlowProvider = ({ children }: { children: ReactNode }) => {
  const [initInfo, setInitInfo] = useState(emptyInitInfo)
  const [kycAuthParams, setKycAuthParams] = useState<KycAuthParams | undefined>()
  const [noteInfo, setNoteInfo] = useState(emptyNoteInfo)
  const [deepLinkInfo, setDeepLinkInfo] = useState<DeepLinkInfo | undefined>()
  const [recvInfo, setRecvInfo] = useState(emptyRecvInfo)
  const [sendInfo, setSendInfo] = useState(emptySendInfo)
  const [swapInfo, setSwapInfo] = useState<SwapInfo>()
  const [swapOrderInfo, setSwapOrderInfo] = useState<SwapOrderInfo>()
  const [txInfo, setTxInfo] = useState<TxInfo>()
  const [assetInfo, setAssetInfo] = useState<AssetDetails>(emptyAssetInfo)
  const [lnurlInfo, setLnurlInfo] = useState<LnUrlInfo>()
  const [bankRecvInfo, setBankRecvInfo] = useState<BankRecvInfo>(emptyBankRecvInfo)
  const [bankSendInfo, setBankSendInfo] = useState<BankSendInfo>(emptyBankSendInfo)
  const [bankStatusOrder, setBankStatusOrder] = useState<ChimeraOrder | undefined>()
  const [currentBankOrderType, setCurrentBankOrderType] = useState<BankOrderType | undefined>()

  return (
    <FlowContext.Provider
      value={{
        initInfo,
        kycAuthParams,
        noteInfo,
        deepLinkInfo,
        lnurlInfo,
        recvInfo,
        sendInfo,
        swapInfo,
        swapOrderInfo,
        txInfo,
        bankRecvInfo,
        bankSendInfo,
        bankStatusOrder,
        currentBankOrderType,
        setInitInfo,
        setKycAuthParams,
        setNoteInfo,
        setDeepLinkInfo,
        setRecvInfo,
        setSendInfo,
        setSwapInfo,
        setSwapOrderInfo,
        setTxInfo,
        assetInfo,
        setAssetInfo,
        setLnurlInfo,
        setBankRecvInfo,
        setBankSendInfo,
        setBankStatusOrder,
        setCurrentBankOrderType,
      }}
    >
      {children}
    </FlowContext.Provider>
  )
}
