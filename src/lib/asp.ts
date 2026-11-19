import {
  IWallet,
  ArkNote,
  RestArkProvider,
  ExtendedCoin,
  ServiceWorkerWallet,
  ExtendedVirtualCoin,
  FeeInfo,
  WalletBalance,
  DelegateContractHandler,
  IVtxoManager,
  Asset,
  sdkVersion,
  ArkAddress,
  getNetwork,
  NetworkName,
} from '@arkade-os/sdk'
import { Address, OutScript } from '@scure/btc-signer'
import { ExitAnchor, ExitPlan, planCollaborativeExit } from './collaborativeExit'
import { Addresses, Tx, Vtxo } from './types'
import { AspInfo } from '../providers/asp'
import { consoleError } from './logs'
import { getConfirmedAndNotExpiredUtxos } from './utxo'
import * as Sentry from '@sentry/react'
import { hex } from '@scure/base'
import { toXOnlyHex } from './keys'
import { activitiesToTxs, getActivities } from './activityHistory'
import type { WalletAssetSwap } from './swapRepository'

const emptyFees: FeeInfo = {
  intentFee: { offchainInput: '', offchainOutput: '', onchainInput: '', onchainOutput: '' },
  txFeeRate: '',
}

export const emptyAspInfo: AspInfo = {
  boardingExitDelay: BigInt(0),
  checkpointTapscript: '',
  deprecatedSigners: [],
  digest: '',
  dust: BigInt(0),
  forfeitAddress: '',
  forfeitPubkey: '',
  fees: emptyFees,
  network: '',
  scheduledSession: {
    nextStartTime: BigInt(0),
    nextEndTime: BigInt(0),
    duration: BigInt(0),
    period: BigInt(0),
    fees: emptyFees,
  },
  serviceStatus: {},
  sessionDuration: BigInt(0),
  signerPubkey: '',
  unilateralExitDelay: BigInt(0),
  utxoMaxAmount: BigInt(-1), // -1 means no limit (default), 0 means boarding not allowed
  utxoMinAmount: BigInt(333),
  version: '',
  vtxoMaxAmount: BigInt(-1), // -1 means no limit (default)
  vtxoMinAmount: BigInt(1),
  unreachable: false,
  url: '',
}

const onchainScriptHex = (address: string, network: string): string =>
  hex.encode(OutScript.encode(Address(getNetwork(network as NetworkName)).decode(address)))

/**
 * Prices a collaborative exit against the Arkade server's intent fees and picks
 * the coins it spends (see lib/collaborativeExit). Settle the returned plan with
 * {@link settleExitPlan} so the user pays exactly what the plan shows.
 */
export const planExit = async (
  wallet: IWallet,
  aspInfo: AspInfo,
  address: string,
  anchor: ExitAnchor,
): Promise<ExitPlan> => {
  if (aspInfo.unreachable || !aspInfo.network) throw new Error('Arkade server info is unavailable')
  const dust = Number(aspInfo.dust)
  if (!dust) throw new Error('Arkade server did not report a dust amount')
  const [coins, changeAddress] = await Promise.all([wallet.getVtxos(), wallet.getAddress()])
  return planCollaborativeExit({
    coins,
    intentFee: aspInfo.fees?.intentFee ?? {},
    destination: address,
    destinationScript: onchainScriptHex(address, aspInfo.network),
    changeAddress,
    changeScript: hex.encode(ArkAddress.decode(changeAddress).pkScript),
    dust,
    anchor,
  })
}

export const settleExitPlan = async (wallet: IWallet, plan: ExitPlan, operation: string): Promise<string> => {
  try {
    return await wallet.settle({ inputs: plan.inputs, outputs: plan.outputs })
  } catch (error) {
    reportSettlementFailure(operation)
    throw error
  }
}

/**
 * Pays `amount` sats exactly to an on-chain address, with the exit's fees on
 * top. Used by embedded apps (Satora, LendaSat) that request a specific amount.
 */
export const collaborativeExit = async (
  wallet: IWallet,
  aspInfo: AspInfo,
  amount: number,
  address: string,
): Promise<string> => {
  const plan = await planExit(wallet, aspInfo, address, { deliver: amount })
  return settleExitPlan(wallet, plan, 'collaborativeExit')
}

export const getAspInfo = async (url: string): Promise<AspInfo> => {
  let fullUrl = url
  if (url.startsWith('localhost') || url.startsWith('127.0.0.1')) fullUrl = 'http://' + url
  else if (!url.startsWith('http')) fullUrl = 'https://' + url
  const provider = new RestArkProvider(fullUrl)
  try {
    const infos = await provider.getInfo()
    return { ...infos, unreachable: false, url }
  } catch (err) {
    consoleError(err, 'error getting asp info')
    return { ...emptyAspInfo, unreachable: true, url }
  }
}

export const getBalance = async (wallet: IWallet): Promise<WalletBalance> => {
  return await wallet.getBalance()
}


export const getTxHistory = async (wallet: IWallet, swaps: WalletAssetSwap[] = []): Promise<Tx[]> => {
  try {
    const activities = await getActivities(wallet)
    return activitiesToTxs(activities, swaps)
  } catch (err) {
    consoleError(err, 'error getting tx history')
    return []
  }
}

export const getVtxos = async (wallet: ServiceWorkerWallet): Promise<{ spendable: Vtxo[]; spent: Vtxo[] }> => {
  const vtxos = await wallet.getVtxos()
  const spendable: Vtxo[] = []
  const spent: Vtxo[] = []
  for (const vtxo of vtxos) {
    const isSpentOffchain = vtxo.spentBy && vtxo.spentBy.length > 0
    const isSettled = vtxo.settledBy && vtxo.settledBy.length > 0
    if (isSpentOffchain || isSettled) spent.push(vtxo)
    else spendable.push(vtxo)
  }
  return { spendable, spent }
}

export const getReceivingAddresses = async (wallet: IWallet): Promise<Addresses> => {
  const [offchainAddr, boardingAddr] = await Promise.all([wallet.getAddress(), wallet.getBoardingAddress()])
  return {
    boardingAddr,
    offchainAddr,
  }
}

export const redeemNotes = async (wallet: IWallet, notes: string[]): Promise<void> => {
  const inputs = notes.map((note) => ArkNote.fromString(note))
  const amount = inputs.reduce((acc, curr) => acc + BigInt(curr.value), BigInt(0))

  const { offchainAddr } = await getReceivingAddresses(wallet)

  try {
    await wallet.settle({
      inputs,
      outputs: [{ address: offchainAddr, amount }],
    })
  } catch (error) {
    reportSettlementFailure('redeemNotes')
    throw error
  }
}

export const sendAssets = async (wallet: IWallet, address: string, assets: Asset[]): Promise<string> => {
  const recipients = [{ address, amount: 0, assets }]
  return wallet.send(recipients[0])
}

export const sendOffChain = async (wallet: IWallet, amount: number, address: string): Promise<string> => {
  return wallet.send({ address, amount })
}

export const getInputsToSettle = async (
  wallet: IWallet,
  vtxoManager: IVtxoManager,
  thresholdMs?: number,
): Promise<{ inputs: ExtendedCoin[]; vtxos: ExtendedVirtualCoin[]; boardingUtxos: ExtendedCoin[] }> => {
  const vtxos = thresholdMs ? await vtxoManager.getExpiringVtxos(thresholdMs) : []
  const boardingUtxos = await getConfirmedAndNotExpiredUtxos(wallet)
  return { inputs: [...boardingUtxos, ...vtxos], vtxos, boardingUtxos }
}

export const settleVtxos = async (
  wallet: IWallet,
  vtxoManager: IVtxoManager,
  dustAmount: bigint,
  thresholdMs?: number,
): Promise<void> => {
  const { inputs } = await getInputsToSettle(wallet, vtxoManager, thresholdMs)

  if (inputs.length === 0) throw new Error('No UTXOs or VTXOs eligible to settle')

  const amount = inputs.reduce((sum, input) => sum + input.value, 0)

  if (amount < Number(dustAmount)) throw new Error('Total amount is below dust threshold')

  const outputs = [
    {
      address: await wallet.getAddress(),
      amount: BigInt(amount),
    },
  ]

  try {
    await wallet.settle({ inputs, outputs }, console.log)
  } catch (error) {
    reportSettlementFailure('settleVtxos')
    throw error
  }
}

// Boards confirmed on-chain deposits (peg-ins) into Arkade. Unlike settleVtxos
// it takes only boarding UTXOs, so it never competes with the SDK's own VTXO
// renewal for the same inputs. Resolves false when there is nothing to board.
export const settleBoardingUtxos = async (wallet: IWallet, dustAmount: bigint): Promise<boolean> => {
  const inputs = await getConfirmedAndNotExpiredUtxos(wallet)
  const amount = inputs.reduce((sum, input) => sum + input.value, 0)
  if (inputs.length === 0 || amount < Number(dustAmount)) return false

  const outputs = [{ address: await wallet.getAddress(), amount: BigInt(amount) }]

  try {
    await wallet.settle({ inputs, outputs }, console.log)
  } catch (error) {
    reportSettlementFailure('settleBoardingUtxos')
    throw error
  }
  return true
}

export const renewCoins = async (
  wallet: IWallet,
  vtxoManager: IVtxoManager,
  dustAmount: bigint,
  thresholdMs?: number,
): Promise<void> => {
  const { inputs } = await getInputsToSettle(wallet, vtxoManager, thresholdMs)
  if (inputs.length > 0) await settleVtxos(wallet, vtxoManager, dustAmount, thresholdMs)
}

export const delegateVtxos = async (wallet: ServiceWorkerWallet): Promise<void> => {
  const cm = await wallet.getContractManager()
  const contractWithVtxos = await cm.getContractsWithVtxos({ type: 'delegate' })
  const dm = await wallet.getDelegatorManager()

  if (!dm) {
    throw new Error('Delegator manager not found')
  }

  const delegateInfo = await dm.getDelegateInfo()
  const vtxosToDelegate = contractWithVtxos
    .filter(({ contract, vtxos }) => {
      if (vtxos.length === 0) return false
      const contractParams = DelegateContractHandler.deserializeParams(contract.params)
      const contractDelegatePubKey = hex.encode(contractParams.delegatePubKey) // x-only (32 bytes)
      const delegateInfoPubKey = toXOnlyHex(delegateInfo.pubkey)
      return contractDelegatePubKey === delegateInfoPubKey
    })
    .flatMap((_) => _.vtxos)

  if (vtxosToDelegate.length === 0) return
  const destination = await wallet.getAddress()
  const result = await dm.delegate(vtxosToDelegate, destination)
  if (result.failed.length > 0) {
    // eslint-disable-next-line no-console
    console.warn('Delegation partial failure:', result.failed)
  }
}

export const createSettlementTelemetry = (operation: string, correlationId: string = crypto.randomUUID()) => ({
  tags: { operation, sdkVersion },
  contexts: { settlement: { category: 'settlement_failure', correlationId } },
})

const reportSettlementFailure = (operation: string): void => {
  Sentry.captureMessage('Settlement failed', createSettlementTelemetry(operation))
}
