import type { RangeBarProps } from '../models/RangeBar.model'

/** The day's min–max span, positioned within the range, with a dot at the average. */
export function RangeBar({ row, accent, height = 8 }: RangeBarProps) {
  return (
    <div className="bg-white/8 relative rounded" style={{ height }}>
      <div
        className="absolute top-0 rounded"
        style={{
          height,
          background: accent,
          opacity: 0.32,
          left: row.barLeft,
          width: row.barWidth,
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          top: height === 8 ? 1 : 0.5,
          width: 6,
          height: 6,
          background: accent,
          left: row.dotLeft,
          marginLeft: -3,
        }}
      />
    </div>
  )
}
