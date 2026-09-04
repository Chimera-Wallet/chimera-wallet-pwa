import { Component, type ErrorInfo, type ReactNode } from 'react'
import ButtonsOnBottom from './ButtonsOnBottom'
import Text, { TextSecondary } from './Text'
import CenterScreen from './CenterScreen'
import * as Sentry from '@sentry/react'
import Content from './Content'
import Button from './Button'
import Padded from './Padded'
import Header from './Header'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    Sentry.withScope((scope) => {
      scope.setExtra('componentStack', errorInfo.componentStack)
      Sentry.captureException(error)
    })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      // Exactly one `.page`. It is absolutely positioned at
      // `top: env(safe-area-inset-top)` with a height of `100dvh` minus that
      // inset, so nesting a second one applied the inset twice — pushing the
      // crash screen down by two notches and overflowing the bottom.
      return (
        <div className='page'>
          <Header text='Something went wrong' />
          <Content>
            <Padded>
              <CenterScreen>
                <Text>The app ran into an unexpected error</Text>
                <Text>Please reload to continue</Text>
                <TextSecondary centered>{this.state.error?.message}</TextSecondary>
              </CenterScreen>
            </Padded>
          </Content>
          <ButtonsOnBottom>
            <Button label='Reload' onClick={this.handleReload} />
          </ButtonsOnBottom>
        </div>
      )
    }

    return this.props.children
  }
}
