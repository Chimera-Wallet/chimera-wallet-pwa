import { useContext, useState, useEffect } from 'react'
import Content from '../../../components/Content'
import FlexCol from '../../../components/FlexCol'
import Header from '../../../components/Header'
import Padded from '../../../components/Padded'
import Text, { TextLabel, TextSecondary } from '../../../components/Text'
import Button from '../../../components/Button'
import Shadow from '../../../components/Shadow'
import Loading from '../../../components/Loading'
import ErrorMessage from '../../../components/Error'
import FlexRow from '../../../components/FlexRow'
import SheetModal from '../../../components/SheetModal'
import Select from '../../../components/Select'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { FlowContext } from '../../../providers/flow'
import { getSupportedAssets, createOrder, SupportedAsset, CreateOrderPayload } from '../../../providers/chimera'
import { getStoredKycStatus, KycStatus } from '../../../lib/kyc'
import { WalletContext } from '../../../providers/wallet'
import { prettyNumber } from '../../../lib/format'
import { getReceivingAddresses } from '../../../lib/asp'

interface SwapFormProps {
  onBack: () => void
}

const KYC_THRESHOLD_EUR = 1000
const FIXED_TO_ASSET = 'BTC'

export default function SwapForm({ onBack }: SwapFormProps) {
  const { navigate } = useContext(NavigationContext)
  const { recvInfo, setSwapOrderInfo } = useContext(FlowContext)
  const { svcWallet } = useContext(WalletContext)

  // State
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [assets, setAssets] = useState<SupportedAsset[]>([])
  const [selectedAsset, setSelectedAsset] = useState<SupportedAsset | null>(null)
  const [amount, setAmount] = useState<string>('')
  const [showAssetModal, setShowAssetModal] = useState(false)
  const [kycStatus, setKycStatus] = useState<KycStatus>('not_started')
  const [kycRequired, setKycRequired] = useState(false)
  const [arkAddress, setArkAddress] = useState<string>('')

  // Load ark address on mount
  useEffect(() => {
    const loadAddress = async () => {
      if (svcWallet) {
        try {
          const addresses = await getReceivingAddresses(svcWallet)
          setArkAddress(addresses.offchainAddr)
        } catch (error) {
          console.error('Failed to load Ark address:', error)
        }
      }
    }
    loadAddress()
  }, [svcWallet])

  // Fetch supported assets on mount
  useEffect(() => {
    const fetchAssets = async () => {
      try {
        setLoading(true)
        setError('')
        const response = await getSupportedAssets()

        // Filter out BTC from "from" assets since we're converting TO BTC
        const fromAssets = response.from_assets.filter((asset) => asset.symbol !== FIXED_TO_ASSET)

        setAssets(fromAssets)
        if (fromAssets.length > 0) {
          setSelectedAsset(fromAssets[0])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load assets')
      } finally {
        setLoading(false)
      }
    }

    fetchAssets()
  }, [])

  // Check KYC status on mount
  useEffect(() => {
    const status = getStoredKycStatus()
    setKycStatus(status)
  }, [])

  // Check if KYC is required based on amount
  useEffect(() => {
    const numAmount = parseFloat(amount) || 0
    const requiresKyc = numAmount > KYC_THRESHOLD_EUR && kycStatus !== 'confirmed'
    setKycRequired(requiresKyc)
  }, [amount, kycStatus])

  const handleAssetSelect = (symbol: string) => {
    const asset = assets.find((a) => a.symbol === symbol)
    if (asset) {
      setSelectedAsset(asset)
      setAmount('')
      setShowAssetModal(false)
    }
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Allow only numbers and decimal point
    if (/^\d*\.?\d*$/.test(value)) {
      setAmount(value)
    }
  }

  const handleKycNavigate = () => {
    navigate(Pages.SettingsKYC)
  }

  const handleCreateOrder = async () => {
    if (!selectedAsset || !amount) return

    const numAmount = parseFloat(amount)
    if (numAmount <= 0) {
      setError('Please enter a valid amount')
      return
    }

    if (kycRequired) {
      setError('KYC verification is required for amounts over 1,000 EUR')
      return
    }

    try {
      setSubmitting(true)
      setError('')

      // Get destination address from wallet
      const destinationAddress = recvInfo?.offchainAddr || arkAddress

      if (!destinationAddress) {
        setError('Unable to get destination address')
        return
      }

      const payload: CreateOrderPayload = {
        email: '', // User email - could be fetched from settings or prompted
        from_amount: numAmount,
        from_asset: selectedAsset.hash || selectedAsset.symbol,
        to_asset: FIXED_TO_ASSET,
        destination_type: 'crypto',
        destination_crypto_address: destinationAddress,
        origin: 'mobile',
      }

      const orderResponse = await createOrder(payload)

      // Store order in flow context and navigate to details page
      setSwapOrderInfo(orderResponse)
      navigate(Pages.AppSwapOrderDetails)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create order')
    } finally {
      setSubmitting(false)
    }
  }

  const isValidAmount = parseFloat(amount) > 0
  const canSubmit = isValidAmount && !kycRequired && selectedAsset

  if (loading) {
    return (
      <>
        <Header text='Swap' back={onBack} />
        <Content>
          <Loading text='Loading assets...' />
        </Content>
      </>
    )
  }

  return (
    <>
      <Header text='Swap' back={onBack} />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
            <ErrorMessage error={Boolean(error)} text={error} />

            {/* From Asset Selection */}
            <FlexCol gap='0.5rem'>
              <TextLabel>From</TextLabel>
              <Shadow fat onClick={() => setShowAssetModal(true)}>
                <FlexRow between>
                  <FlexRow gap='0.5rem'>
                    <Text bold>{selectedAsset?.symbol || 'Select asset'}</Text>
                    {selectedAsset?.name ? <TextSecondary>{selectedAsset.name}</TextSecondary> : null}
                  </FlexRow>
                  <Text color='purple'>Change</Text>
                </FlexRow>
              </Shadow>
            </FlexCol>

            {/* To Asset (Fixed to BTC) */}
            <FlexCol gap='0.5rem'>
              <TextLabel>To</TextLabel>
              <Shadow fat>
                <FlexRow>
                  <Text bold>{FIXED_TO_ASSET}</Text>
                  <TextSecondary>Bitcoin</TextSecondary>
                </FlexRow>
              </Shadow>
            </FlexCol>

            {/* Amount Input */}
            <FlexCol gap='0.5rem'>
              <TextLabel>Amount ({selectedAsset?.symbol || ''})</TextLabel>
              <Shadow fat>
                <input
                  type='text'
                  inputMode='decimal'
                  placeholder='0.00'
                  value={amount}
                  onChange={handleAmountChange}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--white)',
                    fontSize: '1.25rem',
                    fontWeight: 'bold',
                    outline: 'none',
                  }}
                />
              </Shadow>
              {parseFloat(amount) > KYC_THRESHOLD_EUR ? (
                <Text small>Amounts over {prettyNumber(KYC_THRESHOLD_EUR)} EUR require KYC verification</Text>
              ) : null}
            </FlexCol>

            {/* KYC Warning */}
            {kycRequired ? (
              <Shadow fat border>
                <FlexCol gap='0.5rem'>
                  <Text color='red' bold>
                    KYC Verification Required
                  </Text>
                  <TextSecondary>
                    Transactions over {prettyNumber(KYC_THRESHOLD_EUR)} EUR require identity verification.
                  </TextSecondary>
                  <Button onClick={handleKycNavigate} label='Complete KYC' secondary small />
                </FlexCol>
              </Shadow>
            ) : null}

            {/* Create Order Button */}
            <Button
              onClick={handleCreateOrder}
              label={submitting ? 'Creating Order...' : 'Create Order'}
              disabled={!canSubmit || submitting}
              loading={submitting}
            />
          </FlexCol>
        </Padded>
      </Content>

      {/* Asset Selection Modal */}
      <SheetModal isOpen={showAssetModal} onClose={() => setShowAssetModal(false)}>
        <FlexCol gap='1rem'>
          <Text bold large>
            Select Asset
          </Text>
          <div style={{ maxHeight: '60vh', overflowY: 'auto', width: '100%' }}>
            <Select
              options={assets.map((a) => a.symbol)}
              selected={selectedAsset?.symbol || ''}
              onChange={handleAssetSelect}
            />
          </div>
        </FlexCol>
      </SheetModal>
    </>
  )
}
