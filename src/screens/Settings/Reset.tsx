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
import {useTranslation} from 'react-i18next'

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

  const {t} = useTranslation()

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
      <Header text={t('settings.advanced.deleteMnemonic')} back />
      <Content>
        <Padded>
          <div style={cardStyle}>
            <FlexCol gap='1rem'>
              <FlexCol gap='0.5rem'>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <WarningTriangle />
                </div>
                <Text centered bold heading large color='white'>
                 {t('common.general.warning')}
                </Text>
              </FlexCol>
              <Text small wrap color='white'>
                {t('settings.reset.removeSeed')}
              </Text>
              <Text small wrap color='white'>
                {t('settings.reset.removeMnemonic')}
              </Text>
              <label style={{ cursor: 'pointer', display: 'block' }}>
                <FlexRow gap='0.75rem'>
                  <Checkbox
                    className='rounded-full'
                    checked={confirmed}
                    onCheckedChange={(checked) => setConfirmed(checked === true)}
                    aria-label={t('settings.reset.deleteAccount')}
                  />
                  <Text small wrap color='white'>
                    {t('settings.reset.deleteAccount')}
                  </Text>
                </FlexRow>
              </label>
              <FlexCol gap='0'>
                <Button
                  disabled={!confirmed || loading}
                  label={t('settings.reset.deleteMnemConf')}
                  onClick={handleReset}
                  red
                  loading={loading}
                />
                <Button clear label={t('settings.reset.cancel')} onClick={goBack} />
              </FlexCol>
            </FlexCol>
          </div>
        </Padded>
      </Content>
    </>
  )
}
