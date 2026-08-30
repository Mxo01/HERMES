export interface HourBucket {
  hour: Date
  avg: number
  min: number
  max: number
}

/** An hour of the window: a reading, or `null` when nothing was recorded. */
export type HourSlot = HourBucket | null

export interface HeatCell {
  /** Position within the grid's range, 0–1; null when the hour has no reading. */
  ratio: number | null
  value: number | null
  hour: number
  day: string
}

export interface HeatRow {
  label: string
  date: Date
  cells: HeatCell[]
}
