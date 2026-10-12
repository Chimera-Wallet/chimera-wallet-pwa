import { useContext, useMemo, useState } from 'react'
import { WalletContext } from '../../../providers/wallet'
import { filterTransactionsByDateRange, formatLongDate, generatePdf, StatementData } from '../../../lib/statement'
import { useDateRange } from '../../../hooks/useDateRange'
import { prettyAmount } from '../../../lib/format'
import Button from '../../../components/Button'
import Content from '../../../components/Content'
import FlexCol from '../../../components/FlexCol'
import Header from '../../../components/Header'
import Padded from '../../../components/Padded'
import InputDate from '../../../components/InputDate'
import Text from '../../../components/Text'
import InfoContainer from '../../../components/InfoContainer'
import { InfoLine } from '../../../components/Info'
import Loading from '../../../components/Loading'
import { useTranslation } from 'react-i18next'

export default function Statement() {
  const { txs, balance, dataReady } = useContext(WalletContext)

  const { startDate, endDate, changeStart, changeEnd, rangeError, maxDate } = useDateRange()
  const [isGenerating, setIsGenerating] = useState(false)
  const [pdfError, setPdfError] = useState<string>('')
  const error = rangeError || pdfError

  const {t} = useTranslation()

  const filteredData: StatementData[] = useMemo(() => {
    if (!dataReady || !txs) return []
    return filterTransactionsByDateRange(txs, startDate, endDate)
  }, [txs, startDate, endDate, dataReady])

  const isButtonEnabled = useMemo(() => {
    if (!dataReady || isGenerating) return false
    if (startDate > endDate) return false
    if (txs.length === 0) return false
    return true
  }, [dataReady, startDate, endDate, txs.length, isGenerating])

  const handleGeneratePdf = async () => {
    if (!isButtonEnabled) return

    setIsGenerating(true)
    setPdfError('')

    try {
      await generatePdf({
        startingOn: formatLongDate(startDate),
        endingOn: formatLongDate(endDate),
        data: filteredData,
        balance: prettyAmount(balance),
      })
    } catch (err) {
      console.error('Error generating PDF:', err)
      setPdfError('Failed to generate PDF. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  if (!dataReady) {
    return (
      <>
        <Header back text={t('apps.statement.header')} />
        <Content>
          <Padded>
            <Loading simple />
          </Padded>
        </Content>
      </>
    )
  }

  return (
    <>
      <Header back text={t('apps.statement.header')} />
      <Content>
        <Padded>
          <FlexCol gap='1rem'>
            <Text wrap>{t('apps.statement.descr')}</Text>

            <InputDate label={t('apps.statement.start')} value={startDate} onChange={changeStart} max={maxDate} />

            <InputDate label={t('apps.statement.end')} value={endDate} onChange={changeEnd} max={maxDate} />

            {filteredData.length > 0 && (
              <InfoContainer>
                <InfoLine
                  compact
                  text={t('apps.statement.transFound',{len1: filteredData.length , len2: filteredData.length === 1 ? '' : 's'})}
                />
              </InfoContainer>
            )}

            {filteredData.length === 0 && !isGenerating && (
              <InfoContainer>
                <InfoLine compact color='orange' text={t('apps.statement.noTrans')} />
              </InfoContainer>
            )}

            {error ? (
              <InfoContainer>
                <InfoLine compact color='orange' text={error} />
              </InfoContainer>
            ) : null}

            <Button
              disabled={!isButtonEnabled}
              label={isGenerating ? t('apps.statement.geningPDF') : t('apps.statement.genPDF')}
              loading={isGenerating}
              main
              onClick={handleGeneratePdf}
            />

            {txs.length === 0 ? (
              <Text centered small color='grey'>
                {t('apps.statement.noTransYet')}
              </Text>
            ) : null}
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
