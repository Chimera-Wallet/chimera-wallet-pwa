import { useState } from 'react'
import { endOfDay, startOfDay, subDays } from 'date-fns'

/**
 * A whole-day date range for statement-style screens: defaults to the last
 * `days` days, keeps start ≤ end, and rejects an end date before the start.
 */
export function useDateRange(days = 30) {
  const [startDate, setStartDate] = useState(() => startOfDay(subDays(new Date(), days)))
  const [endDate, setEndDate] = useState(() => endOfDay(new Date()))
  const [rangeError, setRangeError] = useState('')

  const changeStart = (date: Date) => {
    setRangeError('')
    if (date > endDate) setEndDate(endOfDay(date))
    setStartDate(startOfDay(date))
  }

  const changeEnd = (date: Date) => {
    setRangeError('')
    if (endOfDay(date) < startDate) return setRangeError('End date cannot be before start date')
    setEndDate(endOfDay(date))
  }

  // Latest selectable day, as InputDate's `max`
  const maxDate = new Date().toISOString().split('T')[0]

  return { startDate, endDate, changeStart, changeEnd, rangeError, maxDate }
}
