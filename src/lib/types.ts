import { BoltzReverseSwap, BoltzSubmarineSwap } from '@arkade-os/boltz-swap'
import { Asset, NetworkName, type ExtendedVirtualCoin } from '@arkade-os/sdk'

export type Addresses = {
  boardingAddr: string
  offchainAddr: string
}

export type Config = {
  announcementsSeen: string[]
  apps: {
    assets: {
      enabled: boolean
    }
    boltz: {
      connected: boolean
    }
  }
  aspUrl: string
  currencyDisplay: CurrencyDisplay
  delegate: boolean
  fiat: Fiats
  importedAssets: string[]
  haptics: boolean
  nostrBackup: boolean
  notifications: boolean
  pubkey: string
  referralSlideShowSeen: boolean
  showBalance: boolean
  dismissedBanners: string[]
  theme: Themes
  unit: Unit
}

export enum CurrencyDisplay {
  Both = 'Show both',
  Fiat = 'Fiat only',
  Sats = 'Sats only',
}

export type Delegate = {
  fee: number
  url: string
  name: string
  pubkey: string
  address: string
}

export enum Fiats {
  EUR = 'EUR',
  USD = 'USD',
  CHF = 'CHF',
  JPY = 'JPY',
  GBP = 'GBP',
  CNY = 'CNY',
}

export type PendingSwap = BoltzReverseSwap | BoltzSubmarineSwap

export type Satoshis = number

export enum SettingsSections {
  Account = 'Account',
  Advanced = 'Advanced',
  App = 'App',
  General = 'General',
  Security = 'Security',
  Config = 'Config',
}

export enum SettingsOptions {
  Menu = 'menu',
  About = 'about',
  AddressBook = 'address book',
  Advanced = 'advanced',
  Backup = 'backup',
  Biometric = 'biometric authentication',
  Currency = 'currency',
  General = 'general',
  Haptics = 'haptic feedback',
  KnowledgeBase = 'knowledge base',
  KYC = 'KYC - verification',
  Language = 'app language',
  Lock = 'lock wallet',
  Logs = 'logs',
  ManageAccount = 'manage account',
  Notifications = 'notifications',
  Notes = 'notes',
  Password = 'change password',
  Reset = 'reset wallet',
  SecretPhrase = 'Show secret phrase',
  Server = 'server',
  Support = 'support',
  Contracts = 'contracts',
  Vtxos = 'coin control',
  Theme = 'theme',
  Fiat = 'fiat currency',
  Display = 'display preferences',
  Delegates = 'delegates',
}

export enum Themes {
  Auto = 'Auto',
  Dark = 'Dark',
  Light = 'Light',
}

export type Tx = {
  amount: number
  assets?: Asset[]
  boardingTxid: string
  createdAt: number
  explorable: string | undefined
  /** Present only on a Lightning send: its lockup covenant and that
   * covenant's spender, which is a second tx the wallet never signed. */
  lnSend?: LnSendActivity
  preconfirmed: boolean
  redeemTxid: string
  roundTxid: string
  settled: boolean
  type: string
}

export enum Unit {
  BTC = 'btc',
  EUR = 'eur',
  USD = 'usd',
  CHF = 'chf',
  SAT = 'sat',
}

export type Vtxo = ExtendedVirtualCoin

export type Wallet = {
  thresholdMs?: number
  lockedByBiometrics?: boolean
  network?: NetworkName | ''
  nextRollover: number
  passkeyId?: string
  pubkey?: string
}

export interface AssetOption {
  assetId: string
  name: string
  ticker: string
  balance: bigint
  decimals: number
  icon?: string
}


/**
 * The lockup leg of a Lightning send, recorded against its funding txid.
 *
 * A Lightning send is two transactions, not one: the tx the wallet signs funds
 * the lockup covenant, and a second tx spends it — the solver's claim once it
 * has paid the invoice, or the refund back to us when it could not. Only the
 * first is the wallet's own, so nothing in tx history can name the second; the
 * covenant's script is what lets the receipt find it.
 */
export type LnSendActivity = {
  /** Hex pkScript of the lockup covenant — the indexer's watch key. */
  swapPkScript: string
  /** The tx that ended the swap, absent until one exists. */
  spend?: LnSendSpend
}

/** The tx that spent a lockup, and which of the two spends it was. One type
 * because neither half means anything alone. */
export type LnSendSpend = {
  spentTxid: string
  outcome: 'completed' | 'refunded'
}
