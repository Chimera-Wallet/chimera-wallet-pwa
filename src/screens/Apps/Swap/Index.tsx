import { useContext } from 'react'
import { NavigationContext, Pages } from '../../../providers/navigation'
import AssetSwapForm from './AssetSwapForm'

export default function AppSwap() {
  const { navigate } = useContext(NavigationContext)

  return <AssetSwapForm onBack={() => navigate(Pages.Apps)} />
}
