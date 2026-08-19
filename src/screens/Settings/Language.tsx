import Header from './Header'
import Content from '../../components/Content'
import Padded from '../../components/Padded'
import Text from '../../components/Text'
import FlexCol from '../../components/FlexCol'
import {useTranslation} from 'react-i18next'
import { useState } from 'react'
import SelectionList, {SelectionRow} from '../../components/SelectionList'
import GlobeOutlineIcon from '../../icons/GlobeOutline'
import uk from '../../../public/images/icons/ UK.svg'
import france from '../../../public/images/icons/ FRANCE.svg'
import italy from '../../../public/images/icons/ ITALY.svg'
import spain from '../../../public/images/icons/ SPAIN.svg'



export default function Language() {
  const {t, i18n} = useTranslation()

  const [selectedLang, setSelectedLang] = useState<string>(i18n.language || 'en')

  const langRows : SelectionRow[] = [
    {
      icon: uk,
      key: 'en',
      label: 'English',
      right: 'toggle',
      checked: selectedLang === 'en',
      onClick: () => {
        setSelectedLang('en')
        i18n.changeLanguage('en')
      },
    },
    {
      icon: spain,
      key: 'es',
      label: 'Español',
      right: 'toggle',
      checked: selectedLang === 'es',
      onClick: () => {
        setSelectedLang('es')
        i18n.changeLanguage('es')
      },
    },
    {
      icon: italy,
      key: 'it',
      label: 'Italiano',
      right: 'toggle',
      checked: selectedLang === 'it',
      onClick: () => {
        setSelectedLang('it')
        i18n.changeLanguage('it')
      },
    },
  //  {
  //    icon: france,
  //    key: 'fr',
  //    label: 'Français',
  //    right: 'toggle',
  //    checked: selectedLang === 'fr',
  //    onClick: () => {
  //      setSelectedLang('fr')
  //      i18n.changeLanguage('fr')
  //    },
  //  },
  //  {
  //    icon: <GlobeOutlineIcon />,
  //    key: 'jp',
  //    label: '日本語',
  //    right: 'toggle',
  //    checked: selectedLang === 'jp',
  //    onClick: () => {
  //      setSelectedLang('jp')
  //      i18n.changeLanguage('jp')
  //    },
  //  },
  //  {
  //    icon: <GlobeOutlineIcon />,
  //    key: 'ch',
  //    label: '中文',
  //    right: 'toggle',
  //    checked: selectedLang === 'ch',
  //    onClick: () => {
  //      setSelectedLang('ch')
  //      i18n.changeLanguage('ch')
  //    },
  //  },
  //  {
  //    icon: <GlobeOutlineIcon />,
  //    key: 'rs',
  //    label: 'Srpski',
  //    right: 'toggle',
  //    checked: selectedLang === 'rs',
  //    onClick: () => {
  //      setSelectedLang('rs')
  //      i18n.changeLanguage('rs')
  //    },
  //  },
  ]

  return (
    <>
      <Header text={t('settings.language.appLang')} back />
      <Content>
        <Padded>
        <FlexCol gap='1.25rem'>
          <FlexCol gap='0'>
            
            <SelectionList rows={langRows} />
          </FlexCol>
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
