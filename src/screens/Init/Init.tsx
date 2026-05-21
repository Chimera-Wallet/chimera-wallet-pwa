import { useContext, useEffect, useState } from 'react'
import { generateMnemonic, mnemonicToSeedSync } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import Button from '../../components/Button'
import { NavigationContext, Pages } from '../../providers/navigation'
import { AspContext } from '../../providers/asp'
import ErrorMessage from '../../components/Error'
import { FlowContext } from '../../providers/flow'
import { IonContent } from '@ionic/react'
import { deriveKeyFromSeed } from '../../lib/wallet'
import { defaultPassword } from '../../lib/constants'
import FlexCol from '../../components/FlexCol'

export default function Init() {
  const { aspInfo } = useContext(AspContext)
  const { setInitInfo } = useContext(FlowContext)
  const { navigate } = useContext(NavigationContext)

  const [error, setError] = useState(false)

  useEffect(() => {
    setError(aspInfo.unreachable)
  }, [aspInfo.unreachable])

  const handleNewWallet = () => {
    const mnemonic = generateMnemonic(wordlist)
    const seed = mnemonicToSeedSync(mnemonic)
    const privateKey = deriveKeyFromSeed(seed)
    setInitInfo({ privateKey, password: defaultPassword, restoring: false })
    navigate(Pages.InitSuccess)
  }

  const handleOldWallet = () => navigate(Pages.InitRestore)

  return (
    <IonContent style={{ '--background': 'transparent' } as any}>
      {/* Full-screen gradient background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(31, 59, 219, 1) 0%, rgba(3, 14, 78, 1) 100%)',
          zIndex: 0,
        }}
      />

      {/* Full-screen layout */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 'calc(2.5rem + env(safe-area-inset-top))',
          paddingBottom: 'calc(2.5rem + env(safe-area-inset-bottom))',
        }}
      >
        {/* Coins image — top, fills upper portion */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img
            src='/images/chimera_coins.png'
            alt=''
            style={{ width: '280px', maxWidth: '80%', objectFit: 'contain' }}
          />
        </div>

        {/* Logo + tagline + buttons — lower portion */}
        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '0 1.5rem',
          }}
        >
          <img
            src='/images/chimera_white_logo.png'
            alt='Chimera'
            style={{ width: '160px', maxWidth: '60%', objectFit: 'contain', marginBottom: '0.75rem' }}
          />

          <p
            style={{
              color: 'rgba(255, 255, 255, 1)',
              fontFamily: 'Titillium Web',
              fontSize: '14px',
              fontWeight: 600,
              letterSpacing: '1px',
              textAlign: 'center',
              margin: '0 0 2rem',
              textTransform: 'none',
            }}
          >
            Take back control of your money
          </p>

          <ErrorMessage error={error} text='Ark server unreachable' />

          <div style={{ width: '100%' }}>
            <FlexCol gap='0'>
              <Button disabled={error} onClick={handleNewWallet} label='Create New Wallet' />
              <Button disabled={error} onClick={handleOldWallet} label='Restore Wallet' secondary />
            </FlexCol>
          </div>
        </div>
      </div>
    </IonContent>
  )
}
