import i18n from 'i18next';
import { initReactI18next } from 'react-i18next'

import enTerms from './locales/en/terms.json'
import enNetworks from './locales/en/networks.json'
import enPlaceholders from './locales/en/placeholders.json'
import enErrors from './locales/en/errors.json'
import enCommon from './locales/en/common.json'
import enInit from './locales/en/init.json'
import enSettings from './locales/en/settings.json'
import enApps from './locales/en/apps.json'
 

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

import chTerms from './locales/ch/terms.json'
import chNetworks from './locales/ch/networks.json'
import chPlaceholders from './locales/ch/placeholders.json'
import chErrors from './locales/ch/errors.json'
import chCommon from './locales/ch/common.json'

import frTerms from './locales/fr/terms.json'
import frNetworks from './locales/fr/networks.json'
import frPlaceholders from './locales/fr/placeholders.json'
import frErrors from './locales/fr/errors.json'
import frCommon from './locales/fr/common.json'

// import jpTerms from './locales/jp/terms.json'
// import jpNetworks from './locales/jp/networks.json'
// import jpPlaceholders from './locales/jp/placeholders.json'
// import jpErrors from './locales/jp/errors.json'
// import jpCommon from './locales/jp/common.json'

import rsTerms from './locales/rs/terms.json'
import rsNetworks from './locales/rs/networks.json'
import rsErrors from './locales/rs/errors.json'
import rsCommon from './locales/rs/common.json'

i18n.use(initReactI18next).init({
  debug: import.meta.env.DEV,
  fallbackLng: 'en',
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
      common: enCommon,
      init:enInit,
      settings: enSettings,
      apps:enApps,
    }
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
    rs: {
      translation: 
      {
        terms: rsTerms,
        networks: rsNetworks,
        errors: rsErrors,
        common: rsCommon
        },

    },
    fr : {
      translation: 
      {
        terms: frTerms,
        placeholders: frPlaceholders,
        networks: frNetworks,
        errors: frErrors,
        common: frCommon
        },

    },
//    jp:{
//      translation: 
//      {
//        terms: jpTerms,
//        placeholders: jpPlaceholders,
//        networks: jpNetworks,
//        errors: jpErrors,
//        common: jpCommon
//        },
//
//  },
    ch:{
      translation: 
      {
        terms: chTerms,
        placeholders: chPlaceholders,
        networks: chNetworks,
        errors: chErrors,
        common: chCommon
        },

    },

  },
})

console.log(i18n.t('key')); 

export default i18n