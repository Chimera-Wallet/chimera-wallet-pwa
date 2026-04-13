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

export type InfoItemIcon = 'time' | 'fees' | 'warning' | 'info' | 'instruction'
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
        icon: 'warning',
        color: 'orange',
        text: 'Please ensure you send only Bitcoin to a valid ARK or mainnet address. Any other address will cause the assets to be forever lost, and there is no option to recover it.',
      },
      {
        icon: 'time',
        text: 'The transfer time for on-chain Bitcoin depends on network congestion and is, on average, 10 minutes for the first confirmation. If your wallet supports ARK VTXO the transaction will be instant.',
      },
      {
        icon: 'fees',
        text: 'Fees are dynamic on the Bitcoin network and are related to how fast you want to receive your transaction and how the sending wallet manages the transactions. Fees for ARK compatible wallets are close to 0.',
      },
    ],
    ark: [
      {
        icon: 'warning',
        color: 'orange',
        text: 'Please ensure you send only Bitcoin to a valid ARK or mainnet address. Any other address will cause the assets to be forever lost, and there is no option to recover it.',
      },
      {
        icon: 'time',
        text: 'The transfer time for on-chain Ark depends on network congestion and is, on average, 10 minutes for the first confirmation. If your wallet supports ARK VTXO the transaction will be instant.',
      },
      {
        icon: 'fees',
        text: 'Fees are dynamic on the Ark network and are related to how fast you want to receive your transaction and how the sending wallet manages the transactions. Fees for ARK compatible wallets are close to 0.',
      },
    ],
    lightning: [
      {
        icon: 'warning',
        color: 'orange',
        text: 'Please send only using a Lighting network invoice. Any other address will cause the assets to be forever lost, and there is no option to recover it.',
      },
      {
        icon: 'time',
        text: 'The transfer time for the lightning network depends on several factors and is, on average, a few seconds.',
      },
      {
        icon: 'fees',
        text: 'Fees are dynamic on lightning, usually less than 0.01$.',
      },
    ],
    bank: [
      {
        icon: 'info',
        text: 'The transfer time might vary depending on the bank, from instant to 48 hours.',
      },
      {
        icon: 'fees',
        text: 'The fees for bank sends are 0.3% of the sent amount plus 10 CHF if over 1000 CHF.\nThe fees for bank sends are 1% of the sent amount plus 10 CHF if under 1000 CHF.\nYour bank might charge some additional fees we are not aware of.',
      },
    ],
  },
  receive: {
    bitcoin: [
      {
        icon: 'warning',
        color: 'orange',
        text: 'Please send only Bitcoin either using ARK or mainnet. Any other asset sent will be forever lost, and there is no option to recover it.',
      },
      {
        icon: 'time',
        text: 'The transfer time for on-chain Bitcoin depends on network congestion and is, on average, 10 minutes for the first confirmation.',
      },
      {
        icon: 'fees',
        text: 'Fees are dynamic on the Bitcoin network and are related to how fast you want to receive your transaction and how the sending wallet manages the transactions.',
      },
    ],
    ark: [
      {
        icon: 'warning',
        color: 'orange',
        text: 'Please send only Bitcoin using an ARK compatible wallet. Any other asset sent will be forever lost, and there is no option to recover it.',
      },
      {
        icon: 'time',
        text: 'If the sender supports ARK VTXO the transaction will be instant.',
      },
      {
        icon: 'fees',
        text: 'Fees for ARK compatible wallets are close to 0.',
      },
    ],
    lightning: [
      {
        icon: 'instruction',
        text: 'Please send only Bitcoin using the Lighting network. Any other asset sent will be forever lost, and there is no option to recover it.'
      },
      {
        icon: 'warning',
        color: 'orange',
        text: 'To receive the funds you need to stay in the app until the transaction is completed.',
      },
      {
        icon: 'time',
        text: 'The transfer time for the lightning network depends on several factors and is, on average, a few seconds.',
      },
      {
        icon: 'fees',
        text: 'Fees are dynamic on lightning, usually less than 0.01$.',
      },
    ],
    bank: [
      {
        icon: 'info',
        text: 'The transfer time might vary depending on the bank, from instant to 48 hours.',
      },
      {
        icon: 'fees',
        text: 'The fees for bank receives are 0.6% of the received amount plus 10 CHF if over 1000 CHF.\nThe fees for bank receives are 1% of the received amount plus 10 CHF if under 1000 CHF.\nYour bank might charge some additional fees we are not aware of.',
      },
    ],
  },
}


