import { getUserToken } from './token'

export const REVEAL_ACTION = 'GetCardDetails'
/** How far the signed nonce (unix seconds) may be from our clock. */
export const NONCE_MAX_SKEW_S = 60

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/
// 65-byte ECDSA signature (r, s, v) from the user's EOA.
const EOA_SIGNATURE = /^0x[0-9a-fA-F]{130}$/

/** A caller-facing failure with the HTTP status to return. */
export class RevealSessionError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface RevealSession {
  accessToken: string
  actionToken: string
}

export interface RevealSessionDeps {
  apiBase: string
  chainId: string
  /** Epoch ms; injectable for tests. */
  now?: number
  getToken?: typeof getUserToken
  fetchFn?: typeof fetch
}

export async function createRevealSession(body: unknown, deps: RevealSessionDeps): Promise<RevealSession> {
  const { userAddress, nonce, signature } = (body ?? {}) as Record<string, unknown>
  if (typeof userAddress !== 'string' || !EVM_ADDRESS.test(userAddress)) {
    throw new RevealSessionError(400, 'Invalid userAddress')
  }
  if (typeof signature !== 'string' || !EOA_SIGNATURE.test(signature)) {
    throw new RevealSessionError(400, 'Invalid signature')
  }
  if (typeof nonce !== 'number' || !Number.isInteger(nonce)) {
    throw new RevealSessionError(400, 'Invalid nonce')
  }
  const nowS = Math.floor((deps.now ?? Date.now()) / 1000)
  if (Math.abs(nowS - nonce) > NONCE_MAX_SKEW_S) {
    throw new RevealSessionError(400, 'Signature expired, please try again')
  }

  const getToken = deps.getToken ?? getUserToken
  const fetchFn = deps.fetchFn ?? fetch

  let accessToken: string
  try {
    accessToken = await getToken({ type: 'wallet', value: userAddress }, deps.chainId)
  } catch {
    throw new RevealSessionError(502, 'Failed to authenticate with Wirex')
  }

  const res = await fetchFn(`${deps.apiBase}/api/v1/confirmation/signature/verify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Chain-Id': deps.chainId,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ action_type: REVEAL_ACTION, message_signature: signature, nonce }),
  })
  if (!res.ok) {
    // The user token is NOT returned: the caller didn't prove wallet ownership.
    throw new RevealSessionError(res.status >= 500 ? 502 : 401, 'Wirex did not accept the signature')
  }
  const result = (await res.json().catch(() => ({}))) as { action_token?: unknown }
  if (typeof result.action_token !== 'string' || !result.action_token) {
    throw new RevealSessionError(502, 'Wirex returned no action token')
  }

  return { accessToken, actionToken: result.action_token }
}
