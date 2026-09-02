import i18next from 'i18next';
export type TransferMethod = 'bitcoin' | 'ark' | 'lightning' | 'bank'

export const TRANSFER_METHOD = {
  bitcoin: 'bitcoin',
  ark: 'ark',
  lightning: 'lightning',
  bank: 'bank',
} as const

export const TRANSFER_METHOD_OPTIONS: TransferMethod[] = ['bitcoin', 'ark', 'lightning', 'bank']

export const TRANSFER_METHOD_LABELS: Record<TransferMethod, string> = {
  bitcoin: 'Bitcoin (Native)',
  ark: 'Bitcoin (Ark)',
  lightning: 'Bitcoin (Lightning)',
  bank: 'Bank Transfer',
}

export type InfoItemIcon = 'time' | 'fees' | 'warning' | 'info' | 'instruction' | 'receipt' | 'clock'
export type InfoItemColor = 'orange' | 'default'

export interface InfoItem {
  icon?: InfoItemIcon
  color?: InfoItemColor
  text: string
}

export interface MethodTermsAndConditions {
  send: Record<TransferMethod, InfoItem[]>
  receive: Record<TransferMethod, InfoItem[]>
}

export const TERMS_AND_CONDITIONS: MethodTermsAndConditions = {
  send: {
    bitcoin: [
      {
        icon: 'info',
        color: 'orange',
        text: 'terms.send.bitcoin.address',
      },
      {
        icon: 'clock',
        text: 'terms.send.bitcoin.time',
      },
      {
        icon: 'receipt',
        text: 'terms.send.bitcoin.fees',
      },
    ],
    ark: [
      {
        icon: 'info',
        color: 'orange',
        text: 'terms.send.arkade.address',
      },
      {
        icon: 'clock',
        text: 'terms.send.arkade.time',
      },
      {
        icon: 'receipt',
        text: 'terms.send.arkade.fees',
      },
    ],
    lightning: [
      {
        icon: 'info',
        color: 'orange',
        text: 'terms.send.lightning.address',
      },
      {
        icon: 'clock',
        text: 'terms.send.lightning.time',
      },
      {
        icon: 'receipt',
        text: 'terms.send.lightning.fees',
      },
    ],
    bank: [
      {
        icon: 'info',
        text: 'terms.send.bank.time',
      },
      {
        icon: 'receipt',
        text: 'terms.send.lightning.fees',
      },
    ],
  },
  receive: {
    bitcoin: [
      {
        icon: 'info',
        color: 'orange',
        text: 'terms.receive.bitcoin.address',
      },
      {
        icon: 'clock',
        text: 'terms.receive.bitcoin.time',
      },
      {
        icon: 'receipt',
        text: 'terms.receive.bitcoin.fees',
      },
    ],
    ark: [
      {
        icon: 'info',
        color: 'orange',
        text: 'terms.receive.arkade.address',
      },
      {
        icon: 'clock',
        text: 'terms.receive.arkade.time',
      },
      {
        icon: 'receipt',
        text: 'terms.receive.arkade.fees',
      },
    ],
    lightning: [
      {
        icon: 'info',
        text: 'terms.receive.lightning.address',
      },
      {
        icon: 'info',
        color: 'orange',
        text: 'terms.receive.lightning.info',
      },
      {
        icon: 'clock',
        text: 'terms.receive.lightning.time',
      },
      {
        icon: 'receipt',
        text: 'terms.receive.lightning.fees',
      },
    ],
    bank: [
      {
        icon: 'info',
        text: 'terms.receive.bank.time',
      },
      {
        icon: 'receipt',
        text: 'terms.receive.bank.fees',
      },
    ],
  },
}
