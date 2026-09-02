import { useContext, useEffect, useState } from 'react'
import { generateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import Button from '../../components/Button'
import { NavigationContext, Pages } from '../../providers/navigation'
import { AspContext } from '../../providers/asp'
import ErrorMessage from '../../components/Error'
import { FlowContext } from '../../providers/flow'
import FlexCol from '../../components/FlexCol'
import { defaultPassword } from '../../lib/constants'
import { WalletContext } from '../../providers/wallet'
import OnboardingLayout from '../../components/OnboardingLayout'
import {useTranslation} from 'react-i18next'

export default function Init() {
  const { aspInfo } = useContext(AspContext)
  const { setInitInfo } = useContext(FlowContext)
  const { navigate } = useContext(NavigationContext)
  const { authState, wallet } = useContext(WalletContext)

  const [error, setError] = useState(false)

  const {t} = useTranslation()

  useEffect(() => {
    if (wallet.pubkey && authState === 'authenticated') navigate(Pages.Wallet)
  }, [wallet.pubkey, authState])

  useEffect(() => {
    setError(aspInfo.unreachable)
  }, [aspInfo.unreachable])

  const handleNewWallet = () => {
    const mnemonic = generateMnemonic(wordlist)
    setInitInfo({ mnemonic, password: defaultPassword, restoring: false })
    navigate(Pages.InitConnect)
  }

  const handleOldWallet = () => navigate(Pages.InitRestore)

  return (
    <OnboardingLayout>
      <ErrorMessage error={error} text={t('errors.send.arkade.server')} />
      <FlexCol gap='0'>
        <Button disabled={error} onClick={handleNewWallet} label={t('init.init.createWallet')} />
        <Button disabled={error} onClick={handleOldWallet} label={t('init.init.restoreWallet')} secondary />
      </FlexCol>
    </OnboardingLayout>
  )
}
