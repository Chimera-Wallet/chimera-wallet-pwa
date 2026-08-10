import i18n from 'i18next';
import { initReactI18next } from 'react-i18next'

i18n.use(initReactI18next).init({
  debug: import.meta.env.DEV,
  fallbackLng: 'es',
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
        },
    },
  },
})

console.log(i18n.t('key')); 

export default i18n