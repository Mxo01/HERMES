import { useMemo } from 'react'
import { Bell } from 'lucide-react'
import { AlarmCards } from '@/components/panels/AlarmLog'
import { GasPanel } from '@/components/panels/GasPanel'
import { Reveal } from '@/components/shared/Reveal'
import { useHourly } from '@/hooks/useDashboardData'
import { averages, hourlySeries } from '@/lib/series'
import type { Alarm, Meta, Status } from '@/lib/types'

interface AlarmsViewProps {
  alarms: Alarm[]
  /** True until the first alarm-log fetch resolves. */
  alarmsLoading: boolean
  alarmsError: Error | undefined
  status: Status
  /** True until the first live-status fetch resolves. */
  statusLoading: boolean
  statusError: Error | undefined
  meta: Meta | undefined
  days: number
}

/**
 * The phone's third screen. Gas sits at the top because an alarm screen you
 * open in a hurry should answer "is it happening right now?" first.
 */
export function AlarmsView({
  alarms,
  alarmsLoading,
  alarmsError,
  status,
  statusLoading,
  statusError,
  meta,
  days,
}: AlarmsViewProps) {
  const gasHistory = useHourly('gas', 24)
  const rooms = meta?.rooms ?? ['kitchen']
  const gasRoom = rooms.find((room) => status[room]?.gas !== undefined) ?? 'kitchen'

  const gasSeries = useMemo(
    () => averages(hourlySeries(gasHistory.data ?? [], gasRoom, 'gas', 24)),
    [gasHistory.data, gasRoom],
  )

  const gasValueMissing = status[gasRoom]?.gas === undefined
  const gasLoading = (statusLoading && gasValueMissing) || (gasHistory.loading && !gasHistory.data)
  const gasError = statusError ?? gasHistory.error

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-[18px] pt-3.5 pb-3">
        <span className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.3em]">
          <Bell size={14} strokeWidth={2} aria-hidden />
          ALARMS
        </span>
        <span className="text-chalk-faint text-[10px] tracking-[0.1em]">
          {days} DAYS · {alarms.length} EVENT{alarms.length === 1 ? '' : 'S'}
        </span>
      </div>

      <Reveal>
        <GasPanel
          value={status[gasRoom]?.gas?.value}
          threshold={meta?.thresholds.gas ?? 150}
          series={gasSeries}
          variant="card"
          loading={gasLoading}
          error={gasError}
          compact
        />
      </Reveal>

      <Reveal>
        <AlarmCards alarms={alarms} loading={alarmsLoading} error={alarmsError} />
      </Reveal>
    </div>
  )
}
