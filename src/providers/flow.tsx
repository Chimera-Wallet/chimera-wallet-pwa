import { BoltzReverseSwap, BoltzSubmarineSwap } from '@arkade-os/boltz-swap'
import { ReactNode, createContext, useState } from 'react'
import { Tx } from '../lib/types'
import type { TransferMethod } from '../lib/transferMethods'
import { ChimeraOrder } from './chimera'
import type { BankCircuit, BankCurrency, BankData } from '../lib/bankTransferConfig'
export type { TransferMethod } from '../lib/transferMethods'

export interface InitInfo {
  password?: string
  privateKey?: Uint8Array
  restoring?: boolean
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
  invoice?: string
  method?: TransferMethod
  satoshis: number
  txid?: string
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
  arkAddress?: string
  invoice?: string
  lnUrl?: string
  method?: TransferMethod
  pendingSwap?: BoltzSubmarineSwap
  recipient?: string
  satoshis?: number
  swapId?: string
  total?: number
  text?: string
  txid?: string
}

export type SwapInfo = BoltzSubmarineSwap | BoltzReverseSwap | undefined

export type SwapOrderInfo = ChimeraOrder | undefined

export type TxInfo = Tx | undefined

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
  setBankRecvInfo: (arg0: BankRecvInfo) => void
  setBankSendInfo: (arg0: BankSendInfo) => void
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
  method: 'bitcoin',
  satoshis: 0,
}

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
  currency: 'EUR',
  circuit: 'sepa',
  amount: 0,
}

export const emptyBankSendInfo: BankSendInfo = {
  currency: 'EUR',
  circuit: 'sepa',
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
  setBankRecvInfo: () => {},
  setBankSendInfo: () => {},
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
  const [bankRecvInfo, setBankRecvInfo] = useState<BankRecvInfo>(emptyBankRecvInfo)
  const [bankSendInfo, setBankSendInfo] = useState<BankSendInfo>(emptyBankSendInfo)
  const [currentBankOrderType, setCurrentBankOrderType] = useState<BankOrderType | undefined>()

  return (
    <FlowContext.Provider
      value={{
        initInfo,
        kycAuthParams,
        noteInfo,
        deepLinkInfo,
        recvInfo,
        sendInfo,
        swapInfo,
        swapOrderInfo,
        txInfo,
        bankRecvInfo,
        bankSendInfo,
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
        setBankRecvInfo,
        setBankSendInfo,
        setCurrentBankOrderType,
      }}
    >
      {children}
    </FlowContext.Provider>
  )
}
