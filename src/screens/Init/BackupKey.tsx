import { useContext, useMemo } from 'react'
import Button from '../../components/Button'
import ButtonsOnBottom from '../../components/ButtonsOnBottom'
import Content from '../../components/Content'
import FlexCol from '../../components/FlexCol'
import FlexRow from '../../components/FlexRow'
import Header from '../../components/Header'
import InputFake from '../../components/InputFake'
import Padded from '../../components/Padded'
import Shadow from '../../components/Shadow'
import Text, { TextSecondary } from '../../components/Text'
import DontIcon from '../../icons/Dont'
import SafeIcon from '../../icons/Safe'
import XIcon from '../../icons/X'
import { copyToClipboard } from '../../lib/clipboard'
import { privateKeyToNsec } from '../../lib/privateKey'
import { copiedToClipboard } from '../../lib/toast'
import { NavigationContext, Pages } from '../../providers/navigation'
import { useIonToast } from '@ionic/react'
import { FlowContext } from '../../providers/flow'

export default function InitBackupKey() {
  const { navigate } = useContext(NavigationContext)
  const { initInfo } = useContext(FlowContext)
  const [present] = useIonToast()

  const nsec = useMemo(() => (initInfo.privateKey ? privateKeyToNsec(initInfo.privateKey) : ''), [initInfo.privateKey])

  const handleCopy = async () => {
    if (!nsec) return
    await copyToClipboard(nsec)
    present(copiedToClipboard)
  }

  const handleProceed = () => navigate(Pages.InitBiometric)

  return (
    <>
      <Header text='Save your private key' />
      <Content>
        <Padded>
          <FlexCol gap='1.5rem'>
            <FlexCol gap='0.5rem'>
              <Text heading medium>
                Save your private key
              </Text>
              <TextSecondary wrap>
                This is the only way to restore your wallet on another browser or device. Store it somewhere safe — a
                password manager, encrypted notes, or written down securely.
              </TextSecondary>
            </FlexCol>
            <Shadow lighter>
              <FlexCol gap='10px'>
                <InputFake testId='onboarding-private-key' text={nsec} />
                <Button onClick={handleCopy} label='Copy to clipboard' />
              </FlexCol>
            </Shadow>
            <FlexCol gap='0.5rem'>
              <FlexRow>
                <SafeIcon />
                <TextSecondary>Keep your private key safe</TextSecondary>
              </FlexRow>
              <FlexRow>
                <DontIcon />
                <TextSecondary>Don't share it with anyone</TextSecondary>
              </FlexRow>
              <FlexRow>
                <XIcon />
                <TextSecondary>If you lose it you can't recover it</TextSecondary>
              </FlexRow>
            </FlexCol>
          </FlexCol>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button onClick={handleProceed} label="I've saved it — Go to wallet" />
        <Button onClick={handleProceed} label='Skip for now' secondary clear />
      </ButtonsOnBottom>
    </>
  )
}
