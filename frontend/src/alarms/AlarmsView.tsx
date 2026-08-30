import { useMemo } from 'react'
import { AlarmCards } from '@/shared/components/panels/AlarmCards'
import { GasPanel } from '@/shared/components/panels/GasPanel'
import { Reveal } from '@/shared/components/common/Reveal'
import { useHourly } from '@/shared/services/dashboard.service'
import { averages, hourlySeries } from '@/shared/utils/series'
import { KITCHEN } from '@/shared/utils/metrics'
import type { AlarmsViewProps } from './models/AlarmsView.model'

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
  const rooms = meta?.rooms ?? [KITCHEN]
  const gasRoom = rooms.find((room) => status[room]?.gas !== undefined) ?? KITCHEN

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
        <span className="text-[12px] font-semibold tracking-[0.3em]">ALARMS</span>
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
