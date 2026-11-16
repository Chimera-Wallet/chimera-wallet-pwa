"use strict";
// Card-details reveal session (logic only; the HTTP binding is cardReveal.ts).
//
// Wirex's PCI reveal SDK (@wirexapp/card-reveal-web) renders PAN/expiry/CVV
// inside Wirex-served iframes and needs, in the browser, a user bearer token
// plus a GetCardDetails action token. Our proxy never hands user tokens to
// the browser (and it can't prove who is asking — see auth.ts), so this
// endpoint only releases one AFTER Wirex itself has verified the user's
// wallet signature:
//
//   1. the browser signs `By signing this I confirm that I am executing
//      action GetCardDetails at {nonce}` with the user's main-wallet key;
//   2. we mint that user's token and exchange the signature for an action
//      token (POST /api/v1/confirmation/signature/verify);
//   3. only if Wirex accepts the signature do we return both tokens.
//
// Card data never passes through here: the frames fetch it from Wirex directly.
// Nothing sensitive is logged (no tokens, no signature).
Object.defineProperty(exports, "__esModule", { value: true });
exports.RevealSessionError = exports.NONCE_MAX_SKEW_S = exports.REVEAL_ACTION = void 0;
exports.createRevealSession = createRevealSession;
const token_1 = require("./token");
exports.REVEAL_ACTION = 'GetCardDetails';
/** How far the signed nonce (unix seconds) may be from our clock. */
exports.NONCE_MAX_SKEW_S = 60;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
// 65-byte ECDSA signature (r, s, v) from the user's EOA.
const EOA_SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
/** A caller-facing failure with the HTTP status to return. */
class RevealSessionError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
exports.RevealSessionError = RevealSessionError;
async function createRevealSession(body, deps) {
    const { userAddress, nonce, signature } = (body ?? {});
    if (typeof userAddress !== 'string' || !EVM_ADDRESS.test(userAddress)) {
        throw new RevealSessionError(400, 'Invalid userAddress');
    }
    if (typeof signature !== 'string' || !EOA_SIGNATURE.test(signature)) {
        throw new RevealSessionError(400, 'Invalid signature');
    }
    if (typeof nonce !== 'number' || !Number.isInteger(nonce)) {
        throw new RevealSessionError(400, 'Invalid nonce');
    }
    const nowS = Math.floor((deps.now ?? Date.now()) / 1000);
    if (Math.abs(nowS - nonce) > exports.NONCE_MAX_SKEW_S) {
        throw new RevealSessionError(400, 'Signature expired, please try again');
    }
    const getToken = deps.getToken ?? token_1.getUserToken;
    const fetchFn = deps.fetchFn ?? fetch;
    let accessToken;
    try {
        accessToken = await getToken({ type: 'wallet', value: userAddress }, deps.chainId);
    }
    catch {
        throw new RevealSessionError(502, 'Failed to authenticate with Wirex');
    }
    const res = await fetchFn(`${deps.apiBase}/api/v1/confirmation/signature/verify`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Chain-Id': deps.chainId,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({ action_type: exports.REVEAL_ACTION, message_signature: signature, nonce }),
    });
    if (!res.ok) {
        // The user token is NOT returned: the caller didn't prove wallet ownership.
        throw new RevealSessionError(res.status >= 500 ? 502 : 401, 'Wirex did not accept the signature');
    }
    const result = (await res.json().catch(() => ({})));
    if (typeof result.action_token !== 'string' || !result.action_token) {
        throw new RevealSessionError(502, 'Wirex returned no action token');
    }
    return { accessToken, actionToken: result.action_token };
}
