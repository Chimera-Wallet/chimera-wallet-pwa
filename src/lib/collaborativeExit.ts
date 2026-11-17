import { Estimator, type ExtendedVirtualCoin, type FeeInfo } from '@arkade-os/sdk'

/**
 * Plans a collaborative exit (an Arkade → on-chain send) so that it pays the
 * fees the Arkade server charges for it.
 *
 * The server publishes its intent fees as CEL programs (`GET /v1/info` →
 * `fees.intentFee`), not as numbers. On mainnet, for example:
 *
 *   offchainInput:  inputType == 'vtxo' && expiry - now() > 2505216.0 ? amount * 0.002 : 0.0
 *   onchainOutput:  200.0
 *
 * so every coin spent can owe its own fee (here 0.2% of the coin's whole value
 * when it was created recently), on top of the flat on-chain output fee. An
 * intent that declares less is refused with INTENT_INSUFFICIENT_FEE. The
 * programs are evaluated with the SDK's `Estimator`, the same evaluator the
 * SDK uses for its own settlements.
 *
 * The plan is computed once, shown to the user, and then settled as-is, so
 * what is paid is exactly what was shown. Fees owed by a coin only ever fall
 * as it ages, so a plan never becomes underpriced while the user reads it.
 */

export type IntentFeeConfig = FeeInfo['intentFee']

/**
 * What the exit is anchored on:
 * - `deliver`: the destination receives exactly this many sats; fees come on top.
 * - `debit`: exactly this many sats leave the wallet; fees come out of the
 *   amount the destination receives. This is the Send screen's model, where the
 *   amount the user typed is what they spend.
 */
export type ExitAnchor = { deliver: number } | { debit: number }

export interface ExitPlanParams {
  coins: ExtendedVirtualCoin[]
  intentFee: IntentFeeConfig
  destination: string
  /** Hex scriptPubKey of `destination`, for the on-chain output fee program. */
  destinationScript: string
  changeAddress: string
  /** Hex scriptPubKey of `changeAddress`, for the off-chain output fee program. */
  changeScript: string
  /** The server's dust floor: no output, on-chain or change, may be below it. */
  dust: number
  anchor: ExitAnchor
}

export interface ExitPlan {
  inputs: ExtendedVirtualCoin[]
  outputs: { address: string; amount: bigint }[]
  /** Sats the destination receives. */
  deliver: number
  /** Sats that leave the wallet: `deliver + fees`. */
  debit: number
  /** Every fee paid: input fees, the exit fee, the change fee, and any sub-dust remainder. */
  fees: number
}

export class InsufficientExitFundsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InsufficientExitFundsError'
  }
}

const FEE_SOLVE_MAX_ROUNDS = 16

/**
 * The amount `x` an output can be emitted with when `budget` must cover both
 * it and its own fee, `x + fee(x) = budget`. The server prices an output at the
 * amount it is emitted with, so the fee is evaluated on `x`, not on `budget`.
 */
const solveAgainstFee = (budget: number, feeOn: (amount: number) => number): number => {
  let x = budget
  for (let i = 0; i < FEE_SOLVE_MAX_ROUNDS; i++) {
    const next = budget - feeOn(Math.max(x, 0))
    if (next === x) return x
    x = next
  }
  throw new Error(`Output fee does not settle for ${budget} sats`)
}

/** Batch expiry the server prices `expiry` against, mirroring the SDK's `toBatchExpiry`. */
const batchExpiryOf = (coin: ExtendedVirtualCoin): Date | undefined => {
  if (coin.expiresAt) return coin.expiresAt
  if (coin.expiresAtHeight) return new Date(coin.expiresAtHeight * 1000)
  if (coin.virtualStatus?.batchExpiry) return new Date(coin.virtualStatus.batchExpiry)
  return undefined
}

/** The intent fee the server charges for spending `coin`, in whole sats. */
export const inputFeeOf = (estimator: Estimator, coin: ExtendedVirtualCoin): number =>
  estimator.evalOffchainInput({
    amount: BigInt(coin.value),
    type: coin.isSwept ? 'recoverable' : 'vtxo',
    weight: 0,
    birth: coin.createdAt,
    expiry: batchExpiryOf(coin),
  }).satoshis

const carriesAssets = (coin: ExtendedVirtualCoin): boolean => Boolean(coin.assets?.length)

export const planCollaborativeExit = (params: ExitPlanParams): ExitPlan => {
  const { coins, intentFee, destination, destinationScript, changeAddress, changeScript, dust, anchor } = params
  const estimator = new Estimator(intentFee ?? {})
  const exitFee = (amount: number) =>
    estimator.evalOnchainOutput({ amount: BigInt(amount), script: destinationScript }).satoshis
  const changeFee = (amount: number) =>
    estimator.evalOffchainOutput({ amount: BigInt(amount), script: changeScript }).satoshis

  // A coin worth no more than its own fee can't contribute anything.
  const priced = coins
    .map((coin) => ({ coin, fee: inputFeeOf(estimator, coin) }))
    .filter(({ coin, fee }) => fee < coin.value)

  // Spend plain coins before coins carrying assets (those need a change output
  // of at least dust to stay on), coins that owe no fee before coins that do,
  // and then the coins closest to expiry first.
  priced.sort(
    (a, b) =>
      Number(carriesAssets(a.coin)) - Number(carriesAssets(b.coin)) ||
      Number(a.fee > 0) - Number(b.fee > 0) ||
      (batchExpiryOf(a.coin)?.getTime() ?? 0) - (batchExpiryOf(b.coin)?.getTime() ?? 0),
  )

  const plan = (inputs: ExtendedVirtualCoin[], gross: number, deliver: number, change: number): ExitPlan => {
    const outputs = [{ address: destination, amount: BigInt(deliver) }]
    if (change > 0) outputs.push({ address: changeAddress, amount: BigInt(change) })
    const debit = gross - change
    return { inputs, outputs, deliver, debit, fees: debit - deliver }
  }

  const tooLow = (deliver: number) =>
    new Error(`The amount left after fees (${deliver} sats) is below the ${dust} sat minimum`)

  // Tries to complete the exit from the coins selected so far. `null` means
  // more coins are needed.
  const attempt = (inputs: ExtendedVirtualCoin[], gross: number, inputFees: number, assets: boolean) => {
    if ('deliver' in anchor) {
      const deliver = anchor.deliver
      const left = gross - inputFees - deliver - exitFee(deliver)
      if (left < 0) return null
      const change = left > 0 ? solveAgainstFee(left, changeFee) : 0
      if (change >= dust) return plan(inputs, gross, deliver, change)
      // No change, or a change below dust that the server would refuse. Coins
      // carrying assets need a change to keep them, so keep adding coins;
      // otherwise the remainder goes to the fee.
      if (assets) return null
      return plan(inputs, gross, deliver, 0)
    }

    const debit = anchor.debit
    if (gross < debit) return null
    let change = gross - debit
    if (change > 0 && change < dust) {
      if (assets) return null
      // A change the server would refuse goes to the destination instead.
      change = 0
    }
    if (change === 0 && assets) return null
    const budget = gross - change - inputFees - (change > 0 ? changeFee(change) : 0)
    const deliver = solveAgainstFee(budget, exitFee)
    if (deliver < dust) throw tooLow(deliver)
    return plan(inputs, gross, deliver, change)
  }

  if ('deliver' in anchor && anchor.deliver < dust) throw tooLow(anchor.deliver)

  const inputs: ExtendedVirtualCoin[] = []
  let gross = 0
  let inputFees = 0
  let assets = false
  for (const { coin, fee } of priced) {
    inputs.push(coin)
    gross += coin.value
    inputFees += fee
    assets ||= carriesAssets(coin)
    const result = attempt([...inputs], gross, inputFees, assets)
    if (result) return result
  }

  if ('deliver' in anchor) {
    const needed = anchor.deliver + exitFee(anchor.deliver)
    const most = Math.max(0, solveAgainstFee(gross - inputFees, exitFee))
    throw new InsufficientExitFundsError(
      `Insufficient funds: sending ${anchor.deliver} sats on-chain needs ${needed} sats plus input fees, ` +
        `and at most ${most} sats can be sent after fees`,
    )
  }
  throw new InsufficientExitFundsError('Insufficient funds')
}
