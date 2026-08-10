import i18n from 'i18next';
import { initReactI18next } from 'react-i18next'

i18n.use(initReactI18next).init({
  debug: import.meta.env.DEV,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  resources: {
    en: {
      translation: {
        key: 'hello world',
        btc_address_tc: 'Please ensure you send only Bitcoin to a valid Arkade or mainnet address. Any other address will cause the assets to be forever lost, and there is no option to recover it.',
        btc_time_tc: 'The transfer time for on-chain Bitcoin depends on network congestion and is, on average, 10 minutes for the first confirmation. If your wallet supports Arkade VTXO the transaction will be instant.',
        btc_fees_tc: 'Fees are dynamic on the Bitcoin network and are related to how fast you want to receive your transaction and how the sending wallet manages the transactions. Fees for Arkade compatible wallets are close to 0.',
      },
    },
    es:{
        translation: {
            key: 'hola mundo',
            btc_address_tc: 'Por favor asegúrate de enviar solo Bitcoin a una dirección válida de Arkade o mainnet. Cualquier otra dirección hará que los bienes se pierdan para siempre, sin opción de recuperación.',
            btc_time_tc: 'El tiempo de transferencia para Bitcoin en cadena depende de la congestión de la red y es, en promedio, de 10 minutos para la primera confirma. Si tu billetero soporta Arkade VTXO, la transacción será instantánea.',
            btc_fees_tc: 'Las tarifas son dinámicas en la red de Bitcoin y están relacionadas con la rapidez con la que deseas recibir tu transacción y cómo el billetero de envío gestiona las transacciones. Las tarifas para billeteros compatibles con Arkade son cercanas a 0.',
        },
    },
    it: {
        translation: {
            key: 'ciao mondo',
            btc_address_tc: 'Per favore assicurati di inviare solo Bitcoin a un indirizzo valido di Arkade o mainnet. Qualsiasi altro indirizzo farà sì che i beni vadano persi per sempre, senza possibilità di recupero.',
            btc_time_tc: 'Il tempo di transferimento per Bitcoin on-chain dipende dalla congestione della rete ed è, in media, di 10 minuti per la prima conferma. Se il tuo portafoglio supporta Arkade VTXO, la transazione sarà istantanea.',
            btc_fees_tc: 'Le tariffe sono dinamiche sulla rete Bitcoin e sono correlate alla velocità con cui desideri ricever la tua transazione e a come il portafoglio di invio gestisce le transazioni. Le tariffe per i portafogli compatibili con Arkade sono vicine a 0.',
        },
    },
  },
})

console.log(i18n.t('key')); // Output: hello world

export default i18n