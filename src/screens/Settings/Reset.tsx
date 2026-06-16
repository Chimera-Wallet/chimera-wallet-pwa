import { useContext, useState } from 'react'
import Button from '../../components/Button'
import { WalletContext } from '../../providers/wallet'
import Padded from '../../components/Padded'
import Content from '../../components/Content'
import Header from './Header'
import Text from '../../components/Text'
import { Checkbox } from '../../components/ui/checkbox'
import { consoleError } from '../../lib/logs'
import FlexCol from '../../components/FlexCol'
import FlexRow from '../../components/FlexRow'
import { SwapsContext } from '../../providers/swaps'
import { OptionsContext } from '../../providers/options'

function WarningTriangle() {
  return (
    <svg width='34' height='34' viewBox='0 0 24 24' fill='none' stroke='var(--red-400)' strokeWidth='2'>
      <path d='M12 3L2 20h20L12 3z' strokeLinejoin='round' />
      <path d='M12 9v5' strokeLinecap='round' />
      <circle cx='12' cy='17' r='0.6' fill='var(--red-400)' stroke='none' />
    </svg>
  )
}

export default function Reset() {
  const { resetWallet } = useContext(WalletContext)
  const { arkadeSwaps } = useContext(SwapsContext)
  const { goBack } = useContext(OptionsContext)

  const [confirmed, setConfirmed] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleReset = async () => {
    setLoading(true)
    try {
      await Promise.all([
        resetWallet(),
        // stop swap manager polling and clear swap data
        arkadeSwaps?.reset(),
      ])
      location.reload()
    } catch (err) {
      consoleError(err)
      setLoading(false)
    }
  }

  const cardStyle: React.CSSProperties = {
    backgroundColor: 'color-mix(in srgb, var(--red-500) 28%, var(--bg))',
    borderRadius: 16,
    padding: '24px 20px',
    width: '100%',
  }

  return (
    <>
      <Header text='Delete Mnemonic' back />
      <Content>
        <Padded>
          <div style={cardStyle}>
            <FlexCol gap='1rem'>
              <FlexCol gap='0.5rem'>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <WarningTriangle />
                </div>
                <Text centered bold heading large color='white'>
                  WARNING
                </Text>
              </FlexCol>
              <Text small wrap color='white'>
                Definitively removes your seed from this device. Be extremely careful, after deletion it will be
                impossible to retrieve your key from Chimera Wallet.
              </Text>
              <Text small wrap color='white'>
                Clicking on "Delete" will delete your mnemonic on this device. Be sure to back it up!
              </Text>
              <label style={{ cursor: 'pointer', display: 'block' }}>
                <FlexRow gap='0.75rem'>
                  <Checkbox
                    className='rounded-full'
                    checked={confirmed}
                    onCheckedChange={(checked) => setConfirmed(checked === true)}
                    aria-label='I understand and delete my account'
                  />
                  <Text small wrap color='white'>
                    I understand and delete my account
                  </Text>
                </FlexRow>
              </label>
              <FlexCol gap='0'>
                <Button
                  disabled={!confirmed || loading}
                  label='YES DELETE MNEMONIC'
                  onClick={handleReset}
                  red
                  loading={loading}
                />
                <Button clear label='CANCEL' onClick={goBack} />
              </FlexCol>
            </FlexCol>
          </div>
        </Padded>
      </Content>
    </>
  )
}
