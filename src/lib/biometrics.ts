import { hex } from '@scure/base'

function generateRandomArray(length: number): Uint8Array {
  const array = new Uint8Array(length)
  window.crypto.getRandomValues(array)
  return array
}

// used to validate the challenge.
// webauth api does some transformations to the base64 string
// so we need to do the same transformations to validate the challenge
function arrayToBase64(data: Uint8Array | ArrayBuffer): string {
  const array = data instanceof ArrayBuffer ? new Uint8Array(data) : data
  return btoa(String.fromCharCode(...array))
    .replaceAll('=', '')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
}

export function isBiometricsSupported(): boolean {
  return 'credentials' in navigator
}

// Function to register a new user
export async function registerUser(): Promise<{ password: string; passkeyId: string }> {
  const decoder = new TextDecoder()
  const challenge = generateRandomArray(32)
  const password = generateRandomArray(21)

  const options: PublicKeyCredentialCreationOptions = {
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'required',
      requireResidentKey: true,
    },
    challenge: challenge as BufferSource,
    pubKeyCredParams: [
      {
        type: 'public-key',
        alg: -7, // ES256 (-7 is the COSE identifier for ES256)
      },
      {
        type: 'public-key',
        alg: -257, // RS256 (-257 is the COSE identifier for RS256)
      },
    ],
    rp: {
      name: 'Arkade',
      id: window.location.hostname,
    },
    timeout: 60000,
    user: {
      id: password as BufferSource,
      name: 'Chimera wallet',
      displayName: 'Chimera wallet',
    },
  }

  const credentials = (await navigator.credentials.create({ publicKey: options })) as PublicKeyCredential
  const authResponse = credentials.response as AuthenticatorAttestationResponse
  const clientDataJSON = JSON.parse(decoder.decode(authResponse.clientDataJSON))

  if (clientDataJSON.type !== 'webauthn.create') throw new Error('Invalid clientDataJSON type')
  if (clientDataJSON.challenge !== arrayToBase64(challenge)) throw new Error('Invalid challenge')
  if (clientDataJSON.origin !== window.location.origin) throw new Error('Invalid origin')

  return { password: hex.encode(password), passkeyId: hex.encode(new Uint8Array(credentials.rawId)) }
}

interface Assertion {
  /** The passkey's user handle, or '' when the authenticator omitted it. */
  userHandle: string
  /** Which credential actually answered, hex-encoded like `passkeyId`. */
  credentialId: string
}

async function getAssertion(allowCredentials: PublicKeyCredentialDescriptor[]): Promise<Assertion> {
  const decoder = new TextDecoder()
  const challenge = generateRandomArray(32)

  const options: PublicKeyCredentialRequestOptions = {
    allowCredentials,
    challenge: challenge as BufferSource,
    rpId: window.location.hostname,
    timeout: 60000,
  }

  const credentials = (await navigator.credentials.get({ publicKey: options })) as PublicKeyCredential
  const authResponse = credentials.response as AuthenticatorAssertionResponse
  const clientDataJSON = JSON.parse(decoder.decode(authResponse.clientDataJSON))

  if (clientDataJSON.type !== 'webauthn.get') throw new Error('Invalid clientDataJSON type')
  if (clientDataJSON.challenge !== arrayToBase64(challenge)) throw new Error('Invalid challenge')
  if (clientDataJSON.origin !== window.location.origin) throw new Error('Invalid origin')

  const userHandle = authResponse.userHandle
  return {
    userHandle: userHandle && userHandle.byteLength > 0 ? hex.encode(new Uint8Array(userHandle)) : '',
    credentialId: hex.encode(new Uint8Array(credentials.rawId)),
  }
}

// Function to authenticate a user
export async function authenticateUser(passkeyId: string | undefined): Promise<string> {
  if (!passkeyId) throw new Error('Missing passkey id')

  // The wallet password IS the passkey's user handle (see registerUser), so an
  // assertion that doesn't carry one is useless to us. WebAuthn allows the
  // authenticator to omit userHandle when allowCredentials names a specific
  // credential, and platform authenticators do — Windows Hello returns null
  // here. Fall back to the discoverable-credential flow, which must return it:
  // registerUser sets residentKey 'required', so the passkey is discoverable.
  // Naming the credential first keeps the common case to a single prompt and
  // avoids an account picker when several passkeys exist for this origin.
  const named = await getAssertion([{ id: hex.decode(passkeyId) as BufferSource, type: 'public-key' }])
  if (named.userHandle) return named.userHandle

  const discoverable = await getAssertion([])
  // The discoverable flow offers every passkey registered for this origin, and
  // each wallet ever created here registered one. Another wallet's handle is a
  // perfectly valid-looking password that simply decrypts nothing, so reject it
  // here instead of letting it surface as "invalid password".
  if (discoverable.credentialId !== passkeyId) {
    throw new Error('A different passkey was chosen. Select the passkey belonging to this wallet.')
  }
  // Never return '': callers treat the result as the decryption password, and
  // an empty one silently no-ops at best and re-encrypts the wallet under an
  // empty password at worst.
  if (!discoverable.userHandle) throw new Error('Passkey did not return a user handle')
  return discoverable.userHandle
}
