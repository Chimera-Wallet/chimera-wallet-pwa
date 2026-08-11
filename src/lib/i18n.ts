import i18n from 'i18next';
import { initReactI18next } from 'react-i18next'

import enTerms from './locales/en/terms.json'
import enNetworks from './locales/en/networks.json'
import enPlaceholders from './locales/en/placeholders.json'
import enErrors from './locales/en/errors.json'
import enCommon from './locales/en/common.json'


import esTerms from './locales/es/terms.json'
import esNetworks from './locales/es/networks.json'
import esPlaceholders from './locales/es/placeholders.json'
import esErrors from './locales/es/errors.json'
import esCommon from './locales/es/common.json'


import itTerms from './locales/it/terms.json'
import itNetworks from './locales/it/networks.json'
import itPlaceholders from './locales/it/placeholders.json'
import itErrors from './locales/it/errors.json'
import itCommon from './locales/it/common.json'

i18n.use(initReactI18next).init({
  debug: import.meta.env.DEV,
  fallbackLng: 'it',
  interpolation: {
    escapeValue: false,
  },

  resources: {
    en: {
      translation: 
      {terms: enTerms,
      placeholders: enPlaceholders,
      networks: enNetworks,
      errors: enErrors,
      common: enCommon}
    },
    es:{
      translation: 
      {
        terms: esTerms,
        placeholders: esPlaceholders,
        networks: esNetworks,
        errors: esErrors,
        common: esCommon
      },
    },
    it: {
      translation: 
      {
        terms: itTerms,
        placeholders: itPlaceholders,
        networks: itNetworks,
        errors: itErrors,
        common: itCommon
        },
    },
  },
})

console.log(i18n.t('key')); 

export default i18n