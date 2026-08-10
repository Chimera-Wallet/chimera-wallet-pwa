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
        text: 'btc_address_tc',
      },
      {
        icon: 'clock',
        text: 'btc_time_tc',
      },
      {
        icon: 'receipt',
        text: 'btc_fees_tc',
      },
    ],
    ark: [
      {
        icon: 'info',
        color: 'orange',
        text: 'ark_address_tc',
      },
      {
        icon: 'clock',
        text: 'ark_time_tc',
      },
      {
        icon: 'receipt',
        text: 'ark_fees_tc',
      },
    ],
    lightning: [
      {
        icon: 'info',
        color: 'orange',
        text: 'lightning_address_tc',
      },
      {
        icon: 'clock',
        text: 'lightning_time_tc',
      },
      {
        icon: 'receipt',
        text: 'lightning_fees_tc',
      },
    ],
    bank: [
      {
        icon: 'info',
        text: 'bank_time_tc',
      },
      {
        icon: 'receipt',
        text: 'bank_fees_tc',
      },
    ],
  },
  receive: {
    bitcoin: [
      {
        icon: 'info',
        color: 'orange',
        text: 'btc_address_tc_rcv',
      },
      {
        icon: 'clock',
        text: 'btc_time_tc_rcv',
      },
      {
        icon: 'receipt',
        text: 'btc_fees_tc_rcv',
      },
    ],
    ark: [
      {
        icon: 'info',
        color: 'orange',
        text: 'ark_address_tc_rcv',
      },
      {
        icon: 'clock',
        text: 'ark_time_tc_rcv',
      },
      {
        icon: 'receipt',
        text: 'ark_fees_tc_rcv',
      },
    ],
    lightning: [
      {
        icon: 'info',
        text: 'lightning_address_tc_rcv',
      },
      {
        icon: 'info',
        color: 'orange',
        text: 'lightning_info_tc_rcv',
      },
      {
        icon: 'clock',
        text: 'lightning_time_tc_rcv',
      },
      {
        icon: 'receipt',
        text: 'lightning_fees_tc_rcv',
      },
    ],
    bank: [
      {
        icon: 'info',
        text: 'bank_time_tc_rcv',
      },
      {
        icon: 'receipt',
        text: 'bank_fees_tc_rcv',
      },
    ],
  },
}
