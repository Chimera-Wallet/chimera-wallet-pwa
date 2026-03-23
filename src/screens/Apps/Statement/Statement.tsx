import { useContext, useMemo, useState } from 'react'
import { WalletContext } from '../../../providers/wallet'
import { filterTransactionsByDateRange, generatePdf, StatementData } from '../../../lib/statement'
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

export default function Statement() {
  const { txs, balance, dataReady } = useContext(WalletContext)

  // Initialize dates: default to last 30 days
  const today = new Date()
  today.setHours(23, 59, 59, 999) // End of today
  
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  thirtyDaysAgo.setHours(0, 0, 0, 0) // Start of that day

  const [startDate, setStartDate] = useState<Date>(thirtyDaysAgo)
  const [endDate, setEndDate] = useState<Date>(today)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string>('')

  // Today's date in YYYY-MM-DD format for max date validation
  const todayString = today.toISOString().split('T')[0]

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

  const handleStartDateChange = (newStartDate: Date) => {
    setError('')
    
    // If start date is after end date, update end date too
    if (newStartDate > endDate) {
      setEndDate(newStartDate)
    }
    setStartDate(newStartDate)
  }

  const handleEndDateChange = (newEndDate: Date) => {
    setError('')
    
    // Validate end date is not before start date
    if (newEndDate < startDate) {
      setError('End date cannot be before start date')
      return
    }
    setEndDate(newEndDate)
  }

  const handleGeneratePdf = async () => {
    if (!isButtonEnabled) return

    setIsGenerating(true)
    setError('')

    try {
      const formatDate = (date: Date): string => {
        return date.toLocaleDateString('en-US', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      }

      await generatePdf({
        startingOn: formatDate(startDate),
        endingOn: formatDate(endDate),
        data: filteredData,
        balance: prettyAmount(balance),
      })
    } catch (err) {
      console.error('Error generating PDF:', err)
      setError('Failed to generate PDF. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  if (!dataReady) {
    return (
      <>
        <Header back text='Account Statement' />
        <Content>
          <Padded>
            <Loading />
          </Padded>
        </Content>
      </>
    )
  }

  return (
    <>
      <Header back text='Account Statement' />
      <Content>
        <Padded>
          <FlexCol gap='1rem'>
            <Text wrap>
              Generate a PDF statement of your transaction history for a specified date range.
            </Text>

            <InputDate
              label='Starting Date'
              value={startDate}
              onChange={handleStartDateChange}
              max={todayString}
            />

            <InputDate
              label='Ending Date'
              value={endDate}
              onChange={handleEndDateChange}
              max={todayString}
            />

            {filteredData.length > 0 && (
              <InfoContainer>
                <InfoLine 
                  compact 
                  text={`${filteredData.length} transaction${filteredData.length === 1 ? '' : 's'} found in selected period`} 
                />
              </InfoContainer>
            )}

            {filteredData.length === 0 && !isGenerating && (
              <InfoContainer>
                <InfoLine 
                  compact 
                  color='orange'
                  text='No transactions found in selected period' 
                />
              </InfoContainer>
            )}

            {error ? (
              <InfoContainer>
                <InfoLine compact color='orange' text={error} />
              </InfoContainer>
            ) : null}

            <Button
              disabled={!isButtonEnabled}
              label={isGenerating ? 'Generating PDF...' : 'Generate PDF'}
              loading={isGenerating}
              main
              onClick={handleGeneratePdf}
            />

            {txs.length === 0 ? (
              <Text centered small color='grey'>
                No transactions available yet
              </Text>
            ) : null}
          </FlexCol>
        </Padded>
      </Content>
    </>
  )
}
