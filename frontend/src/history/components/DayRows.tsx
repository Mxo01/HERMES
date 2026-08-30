import { TriangleAlert } from 'lucide-react'
import { RangeBar } from '@/history/components/RangeBar'
import { formatMetric } from '@/shared/utils/format'
import { dayTableEmptyMessage } from '../history.utils'
import { cn } from '@/shared/utils/cn'
import type { DayRowsProps } from '../models/DayRows.model'

/** The phone variant of `DayTable`: date, average, range bar, alarm count. */
export function DayRows({ rows, metric, accent, loading, error }: DayRowsProps) {
  if (rows.length === 0) {
    return (
      <p className={cn('py-4 text-[11px]', error ? 'text-signal-alert' : 'text-chalk-faint')}>
        {dayTableEmptyMessage(loading, error)}
      </p>
    )
  }

  return (
    <div>
      {rows.map((row) => (
        <div
          key={row.key}
          className="border-white/8 tabular grid items-center gap-x-2.5 border-b py-[9px] text-[11px] tracking-[0.04em]"
          style={{ gridTemplateColumns: '64px 54px 1fr 40px' }}
        >
          <span className="text-chalk-dim">{row.date}</span>
          <span className="text-chalk">{formatMetric(row.avg, metric)}</span>
          <RangeBar row={row} accent={accent} height={7} />
          <span
            className={cn(
              'flex items-center justify-end gap-1 text-[10px]',
              row.alarms ? 'text-signal-alert' : 'text-chalk-trace',
            )}
          >
            {row.alarms ? (
              <>
                <TriangleAlert size={10} strokeWidth={2} aria-hidden />
                {row.alarms}
              </>
            ) : (
              '—'
            )}
          </span>
        </div>
      ))}
    </div>
  )
}
