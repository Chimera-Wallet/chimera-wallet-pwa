import { BoltzSwap } from '@arkade-os/boltz-swap'
import { ReactNode, createContext, useState, Dispatch, SetStateAction } from 'react'
import type { Asset, AssetDetails } from '@arkade-os/sdk'
import { Tx } from '../lib/types'
import type { TransferMethod } from '../lib/transferMethods'
import { ChimeraOrder } from './chimera'
import type { RampOrder, RampBankDetails } from './ramp'
import { DEFAULT_BANK_CURRENCY, DEFAULT_BANK_CIRCUIT, type BankCircuit, type BankCurrency, type BankData } from '../lib/bankTransferConfig'
import type { WrapQuote } from '../lib/arkadeWrap'
import type { SourceChainId } from '../lib/sourceChains'
export type { TransferMethod } from '../lib/transferMethods'
import type { LnSendRequest } from '../lib/lnSwap'
import type { LnReceiveInvoice } from './lnReceive'

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
  pendingLnReceive?: LnReceiveInvoice
  method?: TransferMethod
  satoshis: number
  txid?: string
  addressError?: string
  assetId?: string
  assetAmount?: bigint
  receivedAssets?: Asset[]
  received: boolean
}

// Bank Receive (Deposit) Info - for fiat → crypto — backed by ramp-system
export interface BankRecvInfo {
  currency: BankCurrency
  circuit: BankCircuit
  amount: number
  order?: RampOrder
  bankDetails?: RampBankDetails
}

// Bank Send (Withdraw) Info - for crypto → fiat — backed by ramp-system
export interface BankSendInfo {
  currency: BankCurrency
  circuit: BankCircuit
  amount: number
  bankData?: BankData
  order?: RampOrder
}

// Bank Order Type - track which order is currently active
export type BankOrderType = 'receive' | 'send'

// Wrap Receive Info - native chain deposit -> minted Arkade wrapped asset
export interface WrapRecvInfo {
  assetSymbol: string
  chainId: SourceChainId
  ticker: string
  // Arkade address that receives the minted wrapped asset.
  receiver: string
  // Source-chain address the user will deposit from.
  sender: string
  quote?: WrapQuote
}

// Unwrap Send Info - burn Arkade wrapped asset -> native chain payout
export interface UnwrapSendInfo {
  assetSymbol: string
  chainId: SourceChainId
  ticker: string
  // Arkade address that deposits the wrapped asset.
  sender: string
  // Destination-chain address that receives the payout.
  receiver: string
  quote?: WrapQuote
}

export type SendInfo = {
  address?: string
  assets?: Asset[]
  arkAddress?: string
  invoice?: string
  lnUrl?: string
  pendingSwap?: BoltzSwap
  pendingLnSend?: LnSendRequest
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
  bankStatusOrder: RampOrder | undefined
  currentBankOrderType?: BankOrderType
  wrapRecvInfo: WrapRecvInfo | undefined
  unwrapSendInfo: UnwrapSendInfo | undefined
  setInitInfo: (arg0: InitInfo) => void
  setKycAuthParams: (arg0: KycAuthParams | undefined) => void
  setNoteInfo: (arg0: NoteInfo) => void
  setDeepLinkInfo: (arg0: DeepLinkInfo) => void
  setRecvInfo: (arg0: SetStateAction<RecvInfo>) => void
  setSendInfo: (arg0: SetStateAction<SendInfo>) => void
  setSwapInfo: (arg0: SwapInfo) => void
  setSwapOrderInfo: (arg0: SwapOrderInfo) => void
  setTxInfo: (arg0: TxInfo) => void
  assetInfo: AssetDetails
  setAssetInfo: (arg0: AssetDetails) => void
  lnurlInfo: LnUrlInfo
  setLnurlInfo: (arg0: LnUrlInfo) => void
  setBankRecvInfo: (arg0: BankRecvInfo) => void
  setBankSendInfo: (arg0: BankSendInfo) => void
  setBankStatusOrder: (order: RampOrder | undefined) => void
  setCurrentBankOrderType: (type: BankOrderType | undefined) => void
  setWrapRecvInfo: (arg0: WrapRecvInfo | undefined) => void
  setUnwrapSendInfo: (arg0: UnwrapSendInfo | undefined) => void
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
  wrapRecvInfo: undefined,
  unwrapSendInfo: undefined,
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
  setWrapRecvInfo: () => {},
  setUnwrapSendInfo: () => {},
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
  const [bankStatusOrder, setBankStatusOrder] = useState<RampOrder | undefined>()
  const [currentBankOrderType, setCurrentBankOrderType] = useState<BankOrderType | undefined>()
  const [wrapRecvInfo, setWrapRecvInfo] = useState<WrapRecvInfo | undefined>()
  const [unwrapSendInfo, setUnwrapSendInfo] = useState<UnwrapSendInfo | undefined>()

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
        wrapRecvInfo,
        unwrapSendInfo,
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
        setWrapRecvInfo,
        setUnwrapSendInfo,
      }}
    >
      {children}
    </FlowContext.Provider>
  )
}
