export const calculateCollaborativeExitOutput = (inputAmount: number, outputFee: number): number => {
  const outputAmount = inputAmount - outputFee
  if (!Number.isSafeInteger(outputAmount) || outputAmount <= 0) {
    throw new Error('On-chain output amount must be positive')
  }
  return outputAmount
}
