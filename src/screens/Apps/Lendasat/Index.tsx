import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import Padded from '../../../components/Padded'
import Header from '../../../components/Header'
import Content from '../../../components/Content'
import Button from '../../../components/Button'
import Modal from '../../../components/Modal'
import Text from '../../../components/Text'
import { WalletContext } from '../../../providers/wallet'
import { AddressType, type LoanAsset, WalletProvider } from '@lendasat/lendasat-wallet-bridge'
import { sha256 } from '@noble/hashes/sha2.js'
import * as utils from '@noble/hashes/utils.js'
import * as secp from '@noble/secp256k1'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { hmac } from '@noble/hashes/hmac.js'
import { collaborativeExit, getReceivingAddresses } from '../../../lib/asp'
import { Transaction } from '@arkade-os/sdk'
import { isArkAddress, isBTCAddress } from '../../../lib/address'
import { NavigationContext, Pages } from '../../../providers/navigation'
import {useTranslation} from 'react-i18next'

const { bytesToHex, hexToBytes } = utils
const LENDASAT_IFRAME_URL = import.meta.env.VITE_LENDASAT_IFRAME_URL || 'https://iframe.lendasat.com'
const LENDASAT_IFRAME_ORIGIN = new URL(LENDASAT_IFRAME_URL).origin

interface ApprovalRequest {
  title: string
  details: string
}

const describePsbt = (tx: Transaction): string => {
  const outputs = Array.from({ length: tx.outputsLength }, (_, index) => {
    const output = tx.getOutput(index)
    if (output.amount === undefined) throw new Error('LendaSat requested a PSBT with an incomplete output')
    const address = tx.getOutputAddress(index)
    if (!address) throw new Error('LendaSat requested a PSBT with an unsupported output')
    return `${index + 1}. ${output.amount.toLocaleString()} sats to ${address}`
  })

  let fee = 'Unknown'
  try {
    fee = `${tx.fee.toLocaleString()} sats`
  } catch {
    // A PSBT without all previous-output values cannot provide an exact fee.
  }

  return `Inputs: ${tx.inputsLength}\nOutputs:\n${outputs.join('\n')}\nFee: ${fee}`
}

// Set up SHA256 for @noble/secp256k1
secp.hashes.sha256 = sha256
secp.hashes.hmacSha256 = (key, msg) => hmac(sha256, key, msg)

export default function AppLendasat() {
  const { navigate } = useContext(NavigationContext)
  const { wallet, svcWallet } = useContext(WalletContext)

  const [arkAddress, setArkAddress] = useState<string | null>(null)
  const [boardingAddress, setBoardingAddress] = useState<string | null>(null)
  const [approvalRequest, setApprovalRequest] = useState<ApprovalRequest | null>(null)
  const approvalResolver = useRef<((approved: boolean) => void) | null>(null)

  const {t} = useTranslation()
  useEffect(() => {
    const loadAddress = async () => {
      if (svcWallet) {
        const addresses = await getReceivingAddresses(svcWallet)
        setArkAddress(addresses.offchainAddr)
        setBoardingAddress(addresses.boardingAddr)
      }
    }
    loadAddress()
  }, [svcWallet])

  const iframeRef = useRef<HTMLIFrameElement>(null)

  const requestApproval = useCallback((request: ApprovalRequest): Promise<void> => {
    if (approvalResolver.current) {
      return Promise.reject(new Error('Another LendaSat request is awaiting approval'))
    }

    setApprovalRequest(request)
    return new Promise((resolve, reject) => {
      approvalResolver.current = (approved) => {
        approvalResolver.current = null
        setApprovalRequest(null)
        if (approved) resolve()
        else reject(new Error('Request rejected'))
      }
    })
  }, [])

  const resolveApproval = useCallback((approved: boolean) => {
    approvalResolver.current?.(approved)
  }, [])

  useEffect(() => {
    return () => approvalResolver.current?.(false)
  }, [])

  useEffect(() => {
    if (!iframeRef.current || !arkAddress || !boardingAddress) return

    const provider = new WalletProvider(
      {
        capabilities: () => {
          return {
            bitcoin: {
              signPsbt: true,
              sendBitcoin: true,
            },
            loanAssets: {
              supportedAssets: [],
              canReceive: false,
              canSend: false,
            },
            nostr: {
              hasNpub: false,
            },
            ark: {
              canSend: true,
              canReceive: true,
            },
          }
        },
        async onSendToAddress(address: string, amount: number, asset: 'bitcoin' | LoanAsset): Promise<string> {
          if (!svcWallet) {
            throw Error(t('errors.lendasat.walletNot'))
          }
          if (!Number.isSafeInteger(amount) || amount <= 0) {
            throw new Error('LendaSat requested an invalid amount')
          }

          switch (asset) {
            case 'bitcoin':
              if (isArkAddress(address)) {
                await requestApproval({
                  title: 'Approve Ark payment',
                  details: `Send ${amount.toLocaleString()} sats to ${address}?`,
                })
                const txId = await svcWallet?.send({ amount, address })
                if (txId) {
                  return txId
                } else {
                  throw new Error(t('errors.lendasat.unableSending'))
                }
              } else if (isBTCAddress(address)) {
                await requestApproval({
                  title: 'Approve Bitcoin payment',
                  details: `Send ${amount.toLocaleString()} sats to ${address}?`,
                })
                return await collaborativeExit(svcWallet, amount, address)
              } else {
                throw Error(t('errors.lendasat.unsuppAddress', {addr: address}))
              }
            case 'UsdcPol':
            case 'UsdtPol':
            case 'UsdcEth':
            case 'UsdtEth':
            case 'UsdcStrk':
            case 'UsdtStrk':
            case 'UsdcSol':
            case 'UsdtSol':
            case 'UsdtLiquid':
              throw new Error(t('errors.lendasat.unableSendNonBtc'))
            case 'Usd':
            case 'Eur':
            case 'Chf':
            case 'Mxn':
              throw new Error(t('errors.lendasat.unableFiat'))
          }
        },
        onGetPublicKey: async () => {
          if (!svcWallet) {
            throw new Error(t('errors.lendasat.walletNot'))
          }

          const pk = await svcWallet.identity.compressedPublicKey()
          return bytesToHex(pk)
        },
        onGetDerivationPath: () => {
          console.log(`Called on get derivation path`)
          // this is just a dummy one as arkade wallet uses a single key
          return "m/84'/0'/0'/0/0"
        },
        onGetAddress: async (addressType: AddressType, asset?: LoanAsset) => {
          console.log(`Called on get address: type=${addressType}, asset=${asset}`)

          switch (addressType) {
            case AddressType.ARK:
              if (!arkAddress) throw new Error(t('errors.lendasat.arkAddrLoad'))
              return arkAddress

            case AddressType.BITCOIN:
              if (!boardingAddress) throw new Error(t('errors.lendasat.boardAddrLoad'))
              return boardingAddress

            case AddressType.LOAN_ASSET:
              throw new Error(t('errors.lendasat.unsuppAddr', {addr:addressType}))

            default:
              throw new Error(t('errors.lendasat.unkownAddr', {addr: addressType}))
          }
        },
        onGetNpub: () => {
          console.log(`Called on get npub`)
          // Optional - returning null for now
          throw new Error(t('errors.lendasat.npubSupp'))
        },
        onSignPsbt: async (psbt: string) => {
          if (!svcWallet) {
            throw Error(t('errors.lendasat.walletNot'))
          }
          if (psbt.length > 200_000) throw new Error('LendaSat requested an oversized PSBT')
          const psbtBytes = hexToBytes(psbt)
          const tx = Transaction.fromPSBT(psbtBytes)
          if (!tx.inputsLength || !tx.outputsLength) throw new Error('LendaSat requested an incomplete PSBT')
          await requestApproval({
            title: 'Approve PSBT signature',
            details: describePsbt(tx),
          })
          const signedTx = await svcWallet.identity.sign(tx)
          const signedTxBytes = signedTx.toPSBT()

          return bytesToHex(signedTxBytes)
        },
        async onSignMessage(message: string): Promise<string> {
          if (!svcWallet) {
            throw new Error(t('errors.lendasat.walletNot'))
          }
          if (!message || message.length > 4_096) throw new Error('LendaSat requested an invalid message signature')
          await requestApproval({
            title: 'Approve message signature',
            details: `Sign this message requested by LendaSat?\n\n${message}`,
          })

          // Hash the message with SHA256
          const messageHash = sha256(new TextEncoder().encode(message))

          // Get signature in compact format (64 bytes: r + s)
          const signatureBytes = await svcWallet.identity.signMessage(messageHash, 'ecdsa')

          // Convert compact signature to DER format using @noble/curves/secp256k1
          // The Signature class from @noble/curves supports DER encoding
          const sig = secp256k1.Signature.fromBytes(signatureBytes)
          return sig.toHex('der')
        },
      },
      [LENDASAT_IFRAME_ORIGIN],
    )

    provider.listen(iframeRef.current)

    return () => {
      provider.destroy()
    }
  }, [wallet.pubkey, svcWallet, arkAddress, boardingAddress, requestApproval])

  return (
    <>
      <Header text={t('apps.lendasat.lendasat')} back={() => navigate(Pages.Apps)} />
      <Content>
        <Padded>
          <div style={{ height: '100%' }}>
            <iframe
              ref={iframeRef}
              src={LENDASAT_IFRAME_URL}
              title={t('apps.lendasat.lendasat')}
              className='lendasat-iframe'
              allow='clipboard-write; clipboard-read'
              style={{ width: '100%', height: 'calc(100dvh - 150px)', border: 'none', borderRadius: '8px' }}
            />
          </div>
        </Padded>
      </Content>
      <Modal open={Boolean(approvalRequest)} onOpenChange={(open) => !open && resolveApproval(false)}>
        {approvalRequest ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Text bold large wrap>
              {approvalRequest.title}
            </Text>
            <Text small wrap>
              {approvalRequest.details}
            </Text>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Button label='Reject' onClick={() => resolveApproval(false)} secondary style={{ flex: 1 }} />
              <Button label='Approve' onClick={() => resolveApproval(true)} style={{ flex: 1 }} />
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  )
}
