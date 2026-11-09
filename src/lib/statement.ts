import { Tx } from './types'
import { fromSatoshis, prettyDate } from './format'
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
  const btcAmount = fromSatoshis(tx.amount)
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

export type TablePdfParams = {
  title: string
  /** Lines under the title, e.g. the period covered. */
  subtitle?: string
  /** Bold lines above the table, e.g. the current balance or totals. */
  summary?: string[]
  head: string[]
  rows: string[][]
  /** Per-column jspdf-autotable styles, keyed by column index. */
  columnStyles?: Record<number, Record<string, unknown>>
  filename: string
  /** Open the system print dialog instead of downloading the file. */
  print?: boolean
}

/** e.g. "October 5, 2026" — the date style used on statements and exports. */
export const formatLongDate = (date: Date): string =>
  date.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * Render a titled table as a PDF and download it (or print it). Shared by the
 * account statement and the POS payment exports/receipts.
 */
export const generateTablePdf = async ({
  title,
  subtitle,
  summary = [],
  head,
  rows,
  columnStyles,
  filename,
  print = false,
}: TablePdfParams): Promise<void> => {
  // Dynamically import jsPDF
  const { default: jsPDF } = await import('jspdf')
  await import('jspdf-autotable')

  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()

  // Title
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text(title, pageWidth / 2, 20, { align: 'center' })

  // Subtitle (e.g. date range)
  if (subtitle) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.text(subtitle, pageWidth / 2, 30, { align: 'center' })
  }

  // Summary lines (e.g. current balance)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  summary.forEach((line, i) => doc.text(line, 14, 45 + i * 7))

  // Use autoTable plugin
  ;(doc as any).autoTable({
    head: [head],
    body: rows,
    startY: 55 + Math.max(0, summary.length - 1) * 7,
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
    columnStyles,
  })

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight()
  doc.setFontSize(8)
  doc.setFont('helvetica', 'italic')
  doc.text(`Generated on ${formatLongDate(new Date())}`, pageWidth / 2, pageHeight - 10, { align: 'center' })

  if (print) {
    doc.autoPrint()
    const url = doc.output('bloburl')
    if (!window.open(url, '_blank')) doc.save(filename) // popup blocked — fall back to a download
    return
  }

  doc.save(filename)
}

type GeneratePdfParams = {
  startingOn: string
  endingOn: string
  data: StatementData[]
  balance: string
}

export const generatePdf = async ({ startingOn, endingOn, data, balance }: GeneratePdfParams): Promise<void> => {
  try {
    await generateTablePdf({
      title: 'Account Statement',
      subtitle: `Period: ${startingOn} to ${endingOn}`,
      summary: [`Current Balance: ${balance}`],
      head: ['Date', 'Type', 'Asset', 'Amount', 'Transaction Hash'],
      rows: data.map((item) => [
        item.date,
        item.type,
        item.assetTicker,
        item.amount,
        item.txHash.substring(0, 16) + '...',
      ]),
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 25 },
        2: { cellWidth: 20 },
        3: { cellWidth: 25, halign: 'right' },
        4: { cellWidth: 'auto' },
      },
      filename: `statement_${startingOn.replace(/\s/g, '_')}_to_${endingOn.replace(/\s/g, '_')}.pdf`,
    })
  } catch (error) {
    console.error('Error generating PDF:', error)
    throw error
  }
}
