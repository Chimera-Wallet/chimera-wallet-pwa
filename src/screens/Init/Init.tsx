import { useContext, useEffect, useState } from 'react'
import { generateMnemonic, mnemonicToSeedSync } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import Button from '../../components/Button'
import ButtonsOnBottom from '../../components/ButtonsOnBottom'
import { NavigationContext, Pages } from '../../providers/navigation'
import { AspContext } from '../../providers/asp'
import ErrorMessage from '../../components/Error'
import { FlowContext } from '../../providers/flow'
import Content from '../../components/Content'
import CenterScreen from '../../components/CenterScreen'
import { deriveKeyFromSeed } from '../../lib/wallet'
import WalletNewIcon from '../../icons/WalletNew'
import { defaultPassword } from '../../lib/constants'
import { OnboardStaggerContainer, OnboardStaggerChild } from '../../components/OnboardLoadIn'

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
    <>
      <Content>
        <CenterScreen>
          <OnboardStaggerContainer centered>
            <OnboardStaggerChild>
              <WalletNewIcon />
            </OnboardStaggerChild>
            <OnboardStaggerChild>
              <ErrorMessage error={error} text='Ark server unreachable' />
            </OnboardStaggerChild>
          </OnboardStaggerContainer>
        </CenterScreen>
      </Content>
      <ButtonsOnBottom>
        <Button disabled={error} onClick={handleNewWallet} label='+ Create wallet' />
        <Button disabled={error} onClick={handleOldWallet} label='Restore Wallet' clear />
      </ButtonsOnBottom>
    </>
  )
}
