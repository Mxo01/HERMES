import { useEffect, useRef, useState } from 'react'
import type { DateRange } from '@/shared/models/dates.model'
import { fromISODate, rollRange, toISODate } from '@/shared/utils/dates'

/**
 * A date range that keeps up with the calendar. A range ending on the day it
 * was picked rolls forward at midnight, keeping its length — otherwise "last
 * 14 days" on a dashboard left open overnight goes on ending yesterday. A
 * range ending in the past is a deliberate choice and stays where it is.
 */
export function useRollingRange(
  initial: () => DateRange,
  now: Date,
): [DateRange, (range: DateRange) => void] {
  const [range, setRange] = useState(initial)
  const today = toISODate(now)
  const previousToday = useRef(today)

  useEffect(() => {
    if (previousToday.current === today) return
    const before = fromISODate(previousToday.current)
    previousToday.current = today
    setRange((current) => rollRange(current, before, fromISODate(today)))
  }, [today])

  return [range, setRange]
}
