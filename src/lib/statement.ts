import { Tx } from './types'
import { prettyDate, prettyNumber } from './format'
import { ASSETS } from './assets'

export type StatementData = {
  date: string
  timestamp: number
  type: string
  txHash: string
  assetTicker: string
  amount: string
}

export const formatTransactionForStatement = (tx: Tx): StatementData => {
  const btcAmount = tx.amount / Math.pow(10, ASSETS.BTC.precision)
  const type = tx.type === 'sent' ? 'Withdrawal' : 'Deposit'
  const amount = tx.type === 'sent' ? `-${btcAmount}` : `${btcAmount}`

  return {
    date: prettyDate(tx.createdAt),
    timestamp: tx.createdAt * 1000,
    type,
    txHash: tx.roundTxid || tx.redeemTxid || tx.boardingTxid || '',
    assetTicker: ASSETS.BTC.symbol,
    amount,
  }
}

export const filterTransactionsByDateRange = (txs: Tx[], startDate: Date, endDate: Date): StatementData[] => {
  const startTime = startDate.getTime()
  const endTime = endDate.getTime()

  return txs
    .filter((tx) => {
      const txTime = tx.createdAt * 1000
      return txTime >= startTime && txTime <= endTime
    })
    .map(formatTransactionForStatement)
    .sort((a, b) => b.timestamp - a.timestamp)
}

type GeneratePdfParams = {
  startingOn: string
  endingOn: string
  data: StatementData[]
  balance: string
}

export const generatePdf = async ({ startingOn, endingOn, data, balance }: GeneratePdfParams): Promise<void> => {
  try {
    // Dynamically import jsPDF
    const { default: jsPDF } = await import('jspdf')
    await import('jspdf-autotable')

    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()

    // Title
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text('Account Statement', pageWidth / 2, 20, { align: 'center' })

    // Date range
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.text(`Period: ${startingOn} to ${endingOn}`, pageWidth / 2, 30, { align: 'center' })

    // Current balance
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(`Current Balance: ${balance}`, 14, 45)

    // Transactions table
    const tableData = data.map((item) => [
      item.date,
      item.type,
      item.assetTicker,
      item.amount,
      item.txHash.substring(0, 16) + '...',
    ])

    // Use autoTable plugin
    ;(doc as any).autoTable({
      head: [['Date', 'Type', 'Asset', 'Amount', 'Transaction Hash']],
      body: tableData,
      startY: 55,
      theme: 'grid',
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontStyle: 'bold',
      },
      styles: {
        fontSize: 9,
        cellPadding: 3,
      },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 25 },
        2: { cellWidth: 20 },
        3: { cellWidth: 25, halign: 'right' },
        4: { cellWidth: 'auto' },
      },
    })

    // Footer
    const pageHeight = doc.internal.pageSize.getHeight()
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.text(
      `Generated on ${new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' },
    )

    // Save the PDF
    const filename = `statement_${startingOn.replace(/\s/g, '_')}_to_${endingOn.replace(/\s/g, '_')}.pdf`
    doc.save(filename)
  } catch (error) {
    console.error('Error generating PDF:', error)
    throw error
  }
}
