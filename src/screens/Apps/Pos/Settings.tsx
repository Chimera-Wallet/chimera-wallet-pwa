/**
 * POS settings: payout currency and bank account live here; app-wide options
 * (language, display currency, everything else) open the regular Settings.
 */

import { useContext } from 'react'
import { Landmark } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Content from '../../../components/Content'
import FlexCol from '../../../components/FlexCol'
import Header from '../../../components/Header'
import Padded from '../../../components/Padded'
import { maskBankAccount } from '../../../lib/bankTransferConfig'
import { getPosSettings, isFiatPayout } from '../../../lib/pos'
import { SettingsOptions } from '../../../lib/types'
import { NavigationContext, Pages } from '../../../providers/navigation'
import { OptionsContext } from '../../../providers/options'
import { ConfigContext } from '../../../providers/config'
import { PosRow, payoutCurrencyName } from './shared'
import WalletIcon from '../../../icons/Wallet'
import TransactionsIcon from '../../../icons/Transactions'
import GlobeOutlineIcon from '../../../icons/GlobeOutline'
import CogIcon from '../../../icons/Cog'
import SettingsIcon from '../../../icons/Settings'

const iconStyle: React.CSSProperties = {
  alignItems: 'center',
  backgroundColor: '#000',
  borderRadius: '50%',
  color: '#fff',
  display: 'flex',
  flexShrink: 0,
  height: 40,
  justifyContent: 'center',
  width: 40,
}

export default function PosSettings() {
  const { t } = useTranslation()
  const { navigate } = useContext(NavigationContext)
  const { setOption } = useContext(OptionsContext)
  const { config } = useContext(ConfigContext)

  const settings = getPosSettings()
  const fiat = isFiatPayout(settings.payoutCurrency)

  const openAppSettings = (option: SettingsOptions) => {
    setOption(option)
    navigate(Pages.Settings)
  }

  const icon = (node: React.ReactNode) => <span style={iconStyle}>{node}</span>

  return (
    <>
      <Header text={t('apps.pos.settings.title')} back />
      <Content>
        <Padded>
          <FlexCol gap='0.75rem'>
            <PosRow
              icon={icon(<WalletIcon />)}
              label={t('apps.pos.settings.payout')}
              detail={t(payoutCurrencyName(settings.payoutCurrency))}
              onClick={() => navigate(Pages.AppPosPayout)}
              testId='pos-settings-payout'
            />
            {fiat ? (
              <PosRow
                icon={icon(<Landmark size={20} />)}
                label={t('apps.pos.settings.bank')}
                detail={maskBankAccount(settings.bankData) || t('apps.pos.settings.notSet')}
                onClick={() => navigate(Pages.AppPosPayout, { step: 'bank' })}
                testId='pos-settings-bank'
              />
            ) : null}
            <PosRow
              icon={icon(<TransactionsIcon />)}
              label={t('apps.pos.settings.history')}
              onClick={() => navigate(Pages.AppPosHistory)}
            />
            <PosRow
              icon={icon(<GlobeOutlineIcon />)}
              label={t('apps.pos.settings.language')}
              onClick={() => openAppSettings(SettingsOptions.Language)}
            />
            <PosRow
              icon={icon(<CogIcon />)}
              label={t('apps.pos.settings.currency')}
              detail={config.fiat}
              onClick={() => openAppSettings(SettingsOptions.Currency)}
            />
            <PosRow
              icon={icon(<SettingsIcon />)}
              label={t('apps.pos.settings.more')}
              onClick={() => openAppSettings(SettingsOptions.Menu)}
            />
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
