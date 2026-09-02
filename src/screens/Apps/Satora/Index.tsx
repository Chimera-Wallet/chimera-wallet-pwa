import { useContext, useEffect, useRef, useState } from 'react'
import Padded from '../../../components/Padded'
import Header from '../../../components/Header'
import Content from '../../../components/Content'
import FlexCol from '../../../components/FlexCol'
import { WalletContext } from '../../../providers/wallet'
import { WalletProvider, type LoanAsset, AddressType } from '@lendasat/lendasat-wallet-bridge'
import { collaborativeExit, getReceivingAddresses } from '../../../lib/asp'
import { isArkAddress, isBTCAddress } from '../../../lib/address'
import {useTranslation} from 'react-i18next'

const IFRAME_URL = import.meta.env.VITE_SATORA_IFRAME_URL || 'https://app.satora.io'
const DEFAULT_SWAP_PATH = '/arkade:BTC/polygon:USDC'

export default function AppSatora() {
  const { svcWallet } = useContext(WalletContext)
  const [arkAddress, setArkAddress] = useState<string | null>(null)

  const {t} = useTranslation()

  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const loadAddress = async () => {
      if (svcWallet) {
        try {
          const addresses = await getReceivingAddresses(svcWallet)
          setArkAddress(addresses.offchainAddr)
        } catch (error) {
          console.error('Failed to load Arkade address:', error)
        }
      }
    }
    loadAddress()
  }, [svcWallet])

  useEffect(() => {
    if (!iframeRef.current) return

    const provider = new WalletProvider(
      {
        capabilities: () => {
          return {
            bitcoin: {
              signPsbt: false,
              sendBitcoin: false,
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
        async onGetAddress(addressType: AddressType): Promise<string> {
          switch (addressType) {
            case AddressType.BITCOIN:
            case AddressType.LOAN_ASSET:
              throw Error(t('errors.satora.addressType'))
            case AddressType.ARK:
              if (!arkAddress) throw new Error(t('errors.satora.arkAddr'))
              return arkAddress
          }
        },
        async onSendToAddress(address: string, amount: number, asset: 'bitcoin' | LoanAsset): Promise<string> {
          if (!svcWallet) {
            throw Error(t('errors.satora.walletNot'))
          }

          if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
            throw new Error(t('errors.satora.invalidAm'))
          }

          switch (asset) {
            case 'bitcoin':
              if (isArkAddress(address)) {
                const txId = await svcWallet?.send({ amount, address })
                if (txId) {
                  return txId
                } else {
                  throw new Error(t('errors.satora.unableSending'))
                }
              } else if (isBTCAddress(address)) {
                return await collaborativeExit(svcWallet, amount, address)
              } else {
                throw Error(t('errors.satora.unsuppAddress', {addr:address}))
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
              throw new Error(t('errors.satora.notSat'))
            case 'Usd':
            case 'Eur':
            case 'Chf':
            case 'Mxn':
              throw new Error(t('errors.satora.notSat'))
          }
        },
      },
      [IFRAME_URL],
    )

    provider.listen(iframeRef.current)

    return () => {
      provider.destroy()
    }
  }, [svcWallet, arkAddress])

  return (
    <>
      <Header text={t('errors.satora.satora')} back />
      <Content>
        <Padded>
          <FlexCol gap='2rem' between>
            <iframe
              ref={iframeRef}
              src={`${IFRAME_URL}${DEFAULT_SWAP_PATH}`}
              title='Satora'
              className='satora-iframe'
              allow='clipboard-write; clipboard-read'
              style={{ height: '100%' }}
            />
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
