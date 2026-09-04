import Header from './Header'
import Content from '../../components/Content'
import Padded from '../../components/Padded'
import FlexCol from '../../components/FlexCol'
import {useTranslation} from 'react-i18next'
import { useState } from 'react'
import SelectionList, {SelectionRow} from '../../components/SelectionList'
import { DEFAULT_LANGUAGE, saveLanguageToStorage, type SupportedLanguage } from '../../lib/language'
import uk from '../../../public/images/icons/ UK.svg'
import france from '../../../public/images/icons/ FRANCE.svg'
import italy from '../../../public/images/icons/ ITALY.svg'
import spain from '../../../public/images/icons/ SPAIN.svg'
import china from '../../../public/images/icons/CH.svg'
import japan from '../../../public/images/icons/JP.svg'
import russia from '../../../public/images/icons/RU.svg'

// Label is the language's own endonym, so it reads to a speaker who can't yet
// navigate the UI. `rs` is historical: it names the locale directory and i18n
// resource key, but the translations under it are Russian — hence the endonym
// and flag below.
const LANGUAGES: { key: SupportedLanguage; label: string; icon: string }[] = [
  { key: 'en', label: 'English', icon: uk },
  { key: 'es', label: 'Español', icon: spain },
  { key: 'it', label: 'Italiano', icon: italy },
  { key: 'fr', label: 'Français', icon: france },
  { key: 'jp', label: '日本語', icon: japan },
  { key: 'ch', label: '中文', icon: china },
  { key: 'rs', label: 'Русский', icon: russia },
]

export default function Language() {
  const {t, i18n} = useTranslation()

  const [selectedLang, setSelectedLang] = useState<string>(i18n.language || DEFAULT_LANGUAGE)

  // Built from the table above so a new language can't be added without also
  // being persisted — the old hand-written rows repeated this seven times.
  const langRows: SelectionRow[] = LANGUAGES.map(({ key, label, icon }) => ({
    icon,
    key,
    label,
    right: 'toggle',
    checked: selectedLang === key,
    onClick: () => {
      setSelectedLang(key)
      i18n.changeLanguage(key)
      saveLanguageToStorage(key)
    },
  }))

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
