import { useContext, useState } from 'react'
import Button from '../../components/Button'
import ButtonsOnBottom from '../../components/ButtonsOnBottom'
import { NavigationContext, Pages } from '../../providers/navigation'
import Padded from '../../components/Padded'
import NewPassword from '../../components/NewPassword'
import { FlowContext } from '../../providers/flow'
import Content from '../../components/Content'
import Header from '../../components/Header'
import { defaultPassword } from '../../lib/constants'
import { OnboardStaggerContainer, OnboardStaggerChild } from '../../components/OnboardLoadIn'

export default function InitPassword() {
  const { navigate } = useContext(NavigationContext)
  const { initInfo, setInitInfo } = useContext(FlowContext)

  const [label, setLabel] = useState('')
  const [password, setPassword] = useState<string | null>(null)

  const handleContinue = () => {
    const pass = password ? password : defaultPassword
    setInitInfo({ ...initInfo, password: pass })
    navigate(Pages.InitConnect)
  }

  return (
    <>
      <Header text='Create new wallet' back />
      <Content>
        <Padded>
          <OnboardStaggerContainer>
            <OnboardStaggerChild>
              <NewPassword onNewPassword={setPassword} setLabel={setLabel} />
            </OnboardStaggerChild>
          </OnboardStaggerContainer>
        </Padded>
      </Content>
      <ButtonsOnBottom>
        <Button onClick={handleContinue} label={label} />
      </ButtonsOnBottom>
    </>
  )
}
