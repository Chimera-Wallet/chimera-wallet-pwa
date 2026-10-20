interface AssetBalanceReader {
  getBalance: () => Promise<{ assets: { assetId: string; amount: bigint }[] }>
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export const waitForIssuedAsset = async (
  wallet: AssetBalanceReader,
  assetId: string,
  timeoutMs = 30_000,
  pollIntervalMs = 500,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs

  do {
    const balance = await wallet.getBalance()
    if (balance.assets.some((asset) => asset.assetId === assetId && asset.amount > BigInt(0))) return
    if (Date.now() >= deadline) break
    await delay(Math.min(pollIntervalMs, deadline - Date.now()))
  } while (Date.now() < deadline)

  throw new Error('Timed out waiting for the issued control asset')
}
