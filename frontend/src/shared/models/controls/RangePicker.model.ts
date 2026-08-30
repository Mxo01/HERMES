import type { DateRange } from '@/shared/models/dates.model'

export interface RangePickerProps {
  range: DateRange
  onChange: (range: DateRange) => void
  accent: string
  /** `sheet` slides up from the bottom — the phone presentation. */
  variant?: 'popover' | 'sheet'
}
