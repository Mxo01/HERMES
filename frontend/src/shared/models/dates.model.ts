export interface DateRange {
  from: Date
  to: Date
}

export interface MonthCell {
  date: Date | null
  label: string
}

export interface MonthGrid {
  name: string
  cells: MonthCell[]
}

export interface RangePreset {
  label: string
  days: number
}
