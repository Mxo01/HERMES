import { useMemo } from 'react'
import { AlarmCards } from '@/components/panels/AlarmLog'
import { GasPanel } from '@/components/panels/GasPanel'
import { useHourly } from '@/hooks/useDashboardData'
import { hourlySeries } from '@/lib/series'
import type { Alarm, Meta, Status } from '@/lib/types'

interface AlarmsViewProps {
  alarms: Alarm[]
  status: Status
  meta: Meta | undefined
  days: number
}

/**
 * The phone's third screen. Gas sits at the top because an alarm screen you
 * open in a hurry should answer "is it happening right now?" first.
 */
export function AlarmsView({ alarms, status, meta, days }: AlarmsViewProps) {
  const gasHistory = useHourly('gas', 24)
  const rooms = meta?.rooms ?? ['kitchen']
  const gasRoom = rooms.find((room) => status[room]?.gas !== undefined) ?? 'kitchen'

  const gasSeries = useMemo(
    () => hourlySeries(gasHistory.data ?? [], gasRoom, 'gas', 24).map((bucket) => bucket.avg),
    [gasHistory.data, gasRoom],
  )

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-[18px] pt-3.5 pb-3">
        <span className="text-[12px] font-semibold tracking-[0.3em]">ALARMS</span>
        <span className="text-chalk-faint text-[10px] tracking-[0.1em]">
          {days} DAYS · {alarms.length} EVENT{alarms.length === 1 ? '' : 'S'}
        </span>
      </div>

      <GasPanel
        value={status[gasRoom]?.gas?.value}
        threshold={meta?.thresholds.gas ?? 150}
        series={gasSeries}
        variant="card"
        compact
      />

      <AlarmCards alarms={alarms} />
    </div>
  )
}
