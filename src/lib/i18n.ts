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

        ark_address_tc: 'Please ensure you send only Bitcoin to a valid Arkade or mainnet address. Any other address will cause the assets to be forever lost, and there is no option to recover it.',
        ark_time_tc: 'The transfer time for on-chain Arkade depends on network congestion and is, on average, 10 minutes for the first confirmation. If your wallet supports Arkade VTXO the transaction will be instant.',
        ark_fees_tc: 'Fees are dynamic on the Arkade network and are related to how fast you want to receive your transaction and how the sending wallet manages the transactions. Fees for Arkade compatible wallets are close to 0.',

        lightning_address_tc: 'Please send only using a Lighting network invoice. Any other address will cause the assets to be forever lost, and there is no option to recover it.',
        lightning_time_tc: 'The transfer time for the lightning network depends on several factors and is, on average, a few seconds.',
        lightning_fees_tc: 'Fees are dynamic on lightning, usually less than 0.01$.',
        
        bank_time_tc: 'The transfer time might vary depending on the bank, from instant to 48 hours.',
        bank_fees_tc: 'The fees for bank withdrawals are 0.3% of the sent amount if over 1000 CHF.\nThe fees for bank withdrawals are 1% of the sent amount if under 1000 CHF.\nYour bank might charge some additional fees we are not aware of.',

        btc_address_tc_rcv: 'Please send only Bitcoin either using Arkade or mainnet. Any other asset sent will be forever lost, and there is no option to recover it.',
        btc_time_tc_rcv: 'The transfer time for on-chain Bitcoin depends on network congestion and is, on average, 10 minutes for the first confirmation.',
        btc_fees_tc_rcv: 'Fees are dynamic on the Bitcoin network and are related to how fast you want to receive your transaction and how the sending wallet manages the transactions.',
        
        ark_address_tc_rcv: 'Please send only Bitcoin using an Arkade compatible wallet. Any other asset sent will be forever lost, and there is no option to recover it.',
        ark_time_tc_rcv: 'If the sender supports Arkade VTXO the transaction will be instant.',
        ark_fees_tc_rcv: 'Fees for Arkade compatible wallets are close to 0.', 
        
        lightning_address_tc_rcv: 'Please send only Bitcoin using the Lighting network. Any other asset sent will be forever lost, and there is no option to recover it.',
        lightning_info_tc_rcv: 'To receive the funds you need to stay in the app until the transaction is completed.',
        lightning_time_tc_rcv: 'The transfer time for the lightning network depends on several factors and is, on average, a few seconds.',
        lightning_fees_tc_rcv: 'Fees are dynamic on lightning, usually less than 0.01$.',
        
        bank_time_tc_rcv: 'The transfer time might vary depending on the bank, from instant to 48 hours.',
        bank_fees_tc_rcv: 'The fees for bank deposits are 0.6% of the received amount if over 1000 CHF.\nThe fees for bank deposits are 1% of the received amount if under 1000 CHF.\nYour bank might charge some additional fees we are not aware of.',

        ark_network_selector_descr: 'Instant, low-fee Bitcoin transfers',
        lightning_network_selector_descr: 'Fast Lightning Network payments',
        bitcoin_network_selector_descr: 'Bitcoin on-chain transactions',
        bank_network_selector_descr: 'Traditional bank transfers',

        address_placeholder_fallback: 'Paste address',
        ark_address_placeholder: 'Paste Arkade address',
        lightning_address_placeholder: 'Paste Lightning invoice address',
        bitcoin_address_placeholder: 'Paste BTC address',
        bank_address_placeholder: 'Enter bank details',
        fallback_network_descr: 'Select a network to see its description',

        insufficient_funds_send: 'Insufficient funds',
        LNURL_min_limit_error: 'Amount below LNURL min limit',
        LNURL_max_limit_error: 'Amount above LNURL max limit',
        sat_min_error: 'Amount below 1 satoshi',
        sat_max_error_limit: 'Amount above max limit',
        sat_min_error_limit: 'Amount below min limit',
        network_fee_error: 'Amount below network fee',
        confirm_sending: 'Confirm Sending',


      },
    },
    es:{
        translation: {
            key: 'hola mundo',
            btc_address_tc: 'Por favor asegúrate de enviar solo Bitcoin a una dirección válida de Arkade o mainnet. Cualquier otra dirección hará que los bienes se pierdan para siempre, sin opción de recuperación.',
            btc_time_tc: 'El tiempo de transferencia para Bitcoin en cadena depende de la congestión de la red y es, en promedio, de 10 minutos para la primera confirma. Si tu billetero soporta Arkade VTXO, la transacción será instantánea.',
            btc_fees_tc: 'Las tarifas son dinámicas en la red de Bitcoin y están relacionadas con la rapidez con la que deseas recibir tu transacción y cómo el billetero de envío gestiona las transacciones. Las tarifas para billeteros compatibles con Arkade son cercanas a 0.',
            
            ark_address_tc: 'Por favor asegúrate de enviar solo Bitcoin a una dirección válida de Arkade o mainnet. Cualquier otra dirección hará que los bienes se pierdan para siempre, sin opción de recuperación.',
            ark_time_tc: 'El tiempo de transferencia para Arkade en cadena depende de la congestión de la red y es, en promedio, de 10 minutos para la primera confirma. Si tu billetero soporta Arkade VTXO, la transacción será instantánea.',
            ark_fees_tc: 'Las tarifas son dinámicas en la red de Arkade y están relacionadas con la rapidez con la que deseas recibir tu transacción y cómo el billetero de envío gestiona las transacciones. Las tarifas para billeteros compatibles con Arkade son cercanas a 0.',
        
            lightning_address_tc: 'Por favor envía solo usando una factura de la red Lightning. Cualquier otra direcciń hará que los bienes se pierdan para siempre, sin opción de recuperación.',
            lightning_time_tc: 'El tiempo de transferencia para la red Lightning depende de varios factores y es, en promedio, de unos pocos segundos.',
            lightning_fees_tc: 'Las tarifas son dinámicas en la red Lightning, generalmente menores a 0.01$.',

            bank_time_tc: 'El tiempo de transferencia puede variar dependiendo del banco, desde instantáneo hasta 48 horas.',
            bank_fees_tc: 'Las tarifas para retiros bancarios son del 0.3% de la cantidad enviada si es mayor a 1000 CHF.\nLas tarifas para retiros bancarios son del 1% de la cantidad enviada si es menor a 1000 CHF.\nTu banco podría cobrar algunas tarifas adicionales de las que no somos conscientes.',
        
            btc_address_tc_rcv: 'Por favor, envía solo Bitcoin usando Arkade o mainnet. Cualquier otro bien enviado se perderá para siempre y no hay opción de recuperarlo.',
            btc_time_tc_rcv: 'El tiempo de transferencia para Bitcoin en cadena depende de la congestión de la red y es, en promedio, de 10 minutos para la primera confirmación.',
            btc_fees_tc_rcv: 'Las tarifas son dinámicas en la red de Bitcoin y están relacionadas con la rapidez con la que deseas recibir tu transacción y cómo el billetero de envío gestiona las transacciones. Las tarifas para billeteros compatibles con Arkade son cercanas a 0.',

            ark_address_tc_rcv: 'Por favor, envía solo Bitcoin usando un billetero compatible con Arkade. Cualquier otro bien enviado se perderá para siempre y no hay opción de recuperarlo.',
            ark_time_tc_rcv: 'Si el remitente soporta Arkade VTXO, la transacción será instantánea.',
            ark_fees_tc_rcv: 'Las tarifas para billeteros compatibles con Arkade son cercanas a 0.', 

            lightning_address_tc_rcv: 'Por favor, envía solo Bitcoin usando la red Lightning. Cualquier otro bien enviado se perderá para siempre y no hay opción de recuperarlo.',
            lightning_info_tc_rcv: 'Para recibir los fondos necesitas permanecer en la aplicación hasta que se complete la transacción.',
            lightning_time_tc_rcv: 'El tiempo de transferencia para la red Lightning depende de varios factores y es, en promedio, de unos pocos segundos.',
            lightning_fees_tc_rcv: 'Las tarifas son dinámicas en la red Lightning, generalmente menores a 0.01$.',

            bank_time_tc_rcv: 'El tiempo de transferencia puede variar dependiendo del banco, desde instantáneo hasta 48 horas.',
            bank_fees_tc_rcv: 'Las tarifas para retiros bancarios son del 0.3% de la cantidad enviada si es mayor a 1000 CHF.\nLas tarifas para retiros bancarios son del 1% de la cantidad enviada si es menor a 1000 CHF.\nTu banco podría cobrar algunas tarifas adicionales de las que no somos conscientes.',

            ark_network_selector_descr: 'Transferencias instantáneas y de bajo coste de Bitcoin',
            lightning_network_selector_descr: 'Pagos rápidos con red Lightning',
            bitcoin_network_selector_descr: 'Transferencias Bitcoin en cadena',
            bank_network_selector_descr: 'Transferencias bancarias tradicionales',

            address_placeholder_fallback: 'Pegar dirección',
            ark_address_placeholder: 'Pegar dirección Arkade',
            lightning_address_placeholder: 'Pegar dirección de factura Lightning',
            bitcoin_address_placeholder: 'Pegar dirección BTC',
            bank_address_placeholder: 'Ingresar detalles del banco',
            fallback_network_descr: 'Selecciona una red para ver su descripción',

            insufficient_funds_send: 'Fondos insuficientes',
            LNURL_min_limit_error: 'Cantidad menor al limite mínimo LNURL',
            LNURL_max_limit_error: 'Cantidad mayor al limite máximo LNURL ',
            sat_min_error: 'Cantidad inferior a 1 satoshi',
            sat_max_error_limit: 'Cantidad mayor al limite máximo',
            sat_min_error_limit: 'Cantidad inferior al límite mínimo',
            network_fee_error: 'Cantided inferior a la comisión de red',
            confirm_sending: 'Confirmar envío',
        },
    },
    it: {
        translation: {
            key: 'ciao mondo',
            btc_address_tc: 'Per favore assicurati di inviare solo Bitcoin a un indirizzo valido di Arkade o mainnet. Qualsiasi altro indirizzo farà sì che i beni vadano persi per sempre, senza possibilità di recupero.',
            btc_time_tc: 'Il tempo di transferimento per Bitcoin on-chain dipende dalla congestione della rete ed è, in media, di 10 minuti per la prima conferma. Se il tuo portafoglio supporta Arkade VTXO, la transazione sarà istantanea.',
            btc_fees_tc: 'Le tariffe sono dinamiche sulla rete Bitcoin e sono correlate alla velocità con cui desideri ricever la tua transazione e a come il portafoglio di invio gestisce le transazioni. Le tariffe per i portafogli compatibili con Arkade sono vicine a 0.',
            
            ark_address_tc: 'Per favore assicurati di inviare solo Bitcoin a un indirizzo valido di Arkade o mainnet. Qualsiasi altro indirizzo farà sì che i beni vadano persi per sempre, senza possibilità di recupero.',
            ark_time_tc: 'Il tempo di transferimento per Arkade on-chain dipende dalla congestione della rete ed è, in media, di 10 minuti per la prima conferma. Se il tuo portafoglio supporta Arkade VTXO, la transazione sarà istantanea.',
            ark_fees_tc: 'Le tariffe sono dinamiche sulla rete Arkade e sono correlate alla velocità con cui desideri ricever la tua transazione e a come il portafoglio di invio gestisce le transazioni. Le tariffe per i portafogli compatibili con Arkade sono vicine a 0.',
            
            lightning_address_tc: 'Per favore invia solo utilizzando una fattura della rete Lightning. Qualsiasi altro indirizzo farà sì che i beni vadano persi per sempre, senza possibilità di recupero.',
            lightning_time_tc: 'Il tempo di transferimento per la rete Lightning dipende da diversi fattori ed è, in media, di pochi secondi.',
            lightning_fees_tc: 'Le tariffe sono dinamiche sulla rete Lightning, generalmente inferiori a 0.01$.',

            bank_time_tc: 'Il tempo di transferimento può variare a seconda della banca, da istantaneo a 48 ore.',
            bank_fees_tc: 'Le tariffe per i prelievi bancari sono del 0.3% del importo inviato se superiore a 1000CHF\nLe tariffe per i prelievi bancari sono del 1% del importo inviato se inferiore a 1000CHF\nLa tua banca potrebbe addebitare alcune tariffe aggiuntive di cui non siamo a conoscenza.',
       
            btc_address_tc_rcv: 'Per favore invia solo Bitcoin utilizzando Arkade o mainnet. Qualsiasi altro bene inviato andrà perso per sempre e non esiste possibilità di recuperarlo.',
            btc_time_tc_rcv: 'Il tempo di transferimento per Bitcoin on-chain dipende dalla congestione della rete ed è, in media, di 10 minuti per la prima conferma.',
            btc_fees_tc_rcv: 'Le tariffe sono dinamiche sulla rete Bitcoin e sono correlate alla velocità con cui desideri ricevere la tua transazione e a come il portafoglio di invio gestisce le transazioni. Le tariffe per i portafogli compatibili con Arkade sono vicine a 0.',

            ark_address_tc_rcv: 'Per favore invia solo Bitcoin usando un portafoglio compatibile con Arkade. Qualsiasi altro bene inviato andrà perso per sempre e non esiste possibilità di recuperarlo.',
            ark_time_tc_rcv: 'Se il mittente supporta Arkade VTXO, la transazione sarà istantanea.',
            ark_fees_tc_rcv: 'Tariffe per i portafogli compatibili con Arkade sono vicine a 0.',

            lightning_address_tc_rcv: 'Per favore invia solo Bitcoin utilizzando la rete Lightning. Qualsiasi altro bene inviato andrà perso per sempre e non esiste possibilità di recuperarlo.',
            lightning_info_tc_rcv: 'Per ricevere fondi devi rimanere nell\'app fino al completamento della transazione.',
            lightning_time_tc_rcv: 'Il tempo di transferimento per la rete Lightning dipende da diversi fattori ed è, in media, di pochi secondi.',
            lightning_fees_tc_rcv: 'Le tariffe sono dinamiche sulla rete Lightning, generalmente inferiori a 0.01$.',

            bank_time_tc_rcv: 'Il tempo di transferimento può variare a seconda della banca, da istantaneo a 48 ore.',
            bank_fees_tc_rcv: 'Le tariffe per i prelievi bancari sono del 0.3% del importo inviato se superiore a 1000CHF\nLe tariffe per i prelievi bancari sono del 1% del importo inviato se inferiore a 1000CHF\nLa tua banca potrebbe addebitare alcune tariffe aggiuntive di cui non siamo a conoscenza.',

            ark_network_selector_descr: 'Transferimenti instantanei a basso costo Bitcoin',
            lightning_network_selector_descr: 'Pagamenti rapidi con rete Lightning',
            bitcoin_network_selector_descr: 'Transazioni Bitcoin on-chain',
            bank_network_selector_descr: 'Transferenze bancarie tradizionali',

            address_placeholder_fallback: 'Incolla indirizzo',
            ark_address_placeholder: 'Incolla indirizzo Arkade',
            lightning_address_placeholder: 'Incolla indirizzo fattura Lightning',
            bitcoin_address_placeholder: 'Incolla indirizzo BTC',
            bank_address_placeholder: 'Inserisci dettagli bancari',
            fallback_network_descr: 'Seleziona una rete per vedere la sua descrizione',

            insufficient_funds_send: 'Fondi insufficienti',
            LNURL_min_limit_error: 'Quantità inferiore al limite minimo LNURL',
            LNURL_max_limit_error: 'Quantità superiore al limite massimo LNURL',
            sat_min_error: 'Quantità inferiore a 1 satoshi',
            sat_max_error_limit: 'Quantità superiore al limite massimo',
            sat_min_error_limit: 'Quantità inferiore al limite minimo',
            network_fee_error: 'Quantità inferiore alla commissione di rete ',
            confirm_sending: 'Conferma invio',
        },
    },
  },
})

console.log(i18n.t('key')); 

export default i18n