import { BoltzReverseSwap, BoltzSubmarineSwap } from '@arkade-os/boltz-swap'
import { NetworkName, type ExtendedVirtualCoin } from '@arkade-os/sdk'

export type Addresses = {
  boardingAddr: string
  offchainAddr: string
}

export type Config = {
  announcementsSeen: string[]
  apps: {
    boltz: {
      connected: boolean
    }
  }
  aspUrl: string
  currencyDisplay: CurrencyDisplay
  fiat: Fiats
  haptics: boolean
  nostrBackup: boolean
  notifications: boolean
  pubkey: string
  referralSlideShowSeen: boolean
  showBalance: boolean
  theme: Themes
  unit: Unit
}

export enum CurrencyDisplay {
  Both = 'Show both',
  Fiat = 'Fiat only',
  Sats = 'Sats only',
}

export enum Fiats {
  EUR = 'EUR',
  USD = 'USD',
  CHF = 'CHF',
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
  Haptics = 'haptics feedback',
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
  SecretPhrase = 'Show secret key',
  Server = 'server',
  Support = 'support',
  Vtxos = 'coin control',
  Theme = 'theme',
  Fiat = 'fiat currency',
  Display = 'display preferences',
}

export enum Themes {
  Auto = 'Auto',
  Dark = 'Dark',
  Light = 'Light',
}

export type Tx = {
  amount: number
  boardingTxid: string
  createdAt: number
  explorable: string | undefined
  preconfirmed: boolean
  redeemTxid: string
  roundTxid: string
  settled: boolean
  type: string
}

export enum TxType {
  swap = 'swap',
  utxo = 'utxo',
  vtxo = 'vtxo',
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
