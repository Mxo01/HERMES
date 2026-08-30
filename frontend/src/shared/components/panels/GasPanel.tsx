import { Flame } from 'lucide-react'
import { Sparkline } from '@/shared/components/charts/Sparkline'
import { AnimatedValue } from '@/shared/components/common/AnimatedValue'
import { StatusNote } from '@/shared/components/common/StatusNote'
import { formatStamp } from '@/shared/utils/format'
import { cn } from '@/shared/utils/cn'
import type { GasPanelProps } from '../../models/panels/GasPanel.model'

/**
 * Gas gets its own permanent panel rather than a metric tab: it is the one
 * reading that is a safety matter, so it must never be a click away.
 */
export function GasPanel({
  value,
  threshold,
  series,
  labels,
  lastSpike,
  compact = false,
  variant = 'panel',
  loading = false,
  error,
}: GasPanelProps) {
  const elevated = value !== undefined && value >= threshold * 0.6
  const color = error
    ? 'var(--color-signal-alert)'
    : loading && value === undefined
      ? 'var(--color-chalk-faint)'
      : elevated
        ? 'var(--color-signal-alert)'
        : 'var(--color-signal-ok)'
  const status = error
    ? 'ERROR'
    : value === undefined
      ? loading
        ? 'LOADING'
        : 'NO DATA'
      : elevated
        ? 'ELEVATED'
        : 'NORMAL'
  const fill =
    value === undefined ? '0%' : `${Math.min(100, (value / threshold) * 100).toFixed(1)}%`

  return (
    <div
      className={cn(
        'glass',
        variant === 'card'
          ? 'mx-[18px] mb-3.5 rounded-xl p-4'
          : compact
            ? 'mx-[18px] mb-4 rounded-2xl px-[18px] py-4'
            : 'rounded-2xl px-6 py-5',
      )}
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className="animate-pulse-dot h-[7px] w-[7px] shrink-0 rounded-full"
          style={{ background: color }}
          aria-hidden
        />
        <Flame
          size={compact ? 13 : 14}
          strokeWidth={2}
          className="text-chalk-ghost shrink-0"
          aria-hidden
        />
        <span className={cn('text-chalk-muted', compact ? 'label-xs' : 'label-sm')}>
          {compact ? 'Gas & smoke · MQ-2' : 'Gas & smoke — MQ-2 · Kitchen node A'}
        </span>
        <span
          className="ml-auto uppercase"
          style={{ fontSize: compact ? 10 : 10.5, letterSpacing: '0.16em', color }}
        >
          {status}
        </span>
      </div>

      <div className="flex items-end gap-4">
        <div className="flex items-start gap-[5px]">
          <span
            className="tabular font-medium"
            style={{
              fontSize: variant === 'card' ? 38 : compact ? 42 : 58,
              lineHeight: 0.86,
              letterSpacing: '-0.04em',
              color,
            }}
          >
            <AnimatedValue
              value={value}
              format={(v) => (v === undefined ? '—' : String(Math.round(v)).padStart(3, '0'))}
            />
          </span>
          <span
            className="text-chalk-ghost"
            style={{ fontSize: compact ? 12 : 14, marginTop: compact ? 6 : 8 }}
          >
            / {threshold}
          </span>
        </div>

        {variant !== 'card' && (
          <Sparkline
            values={series}
            color={color}
            strokeWidth={compact ? 3 : 1.6}
            animationKey={String(series.length)}
            labels={labels}
            metric="gas"
            seriesLabel="Gas"
            loading={loading}
            error={error}
            showStatus={false}
            className={cn('block min-w-0 flex-1', compact ? 'h-10' : 'h-[46px]')}
          />
        )}
      </div>

      {/* The tick at 100% marks the alarm threshold, so the bar reads as a
          distance-to-alarm rather than a bare percentage. */}
      <div className="bg-white/8 relative mt-4 h-2 rounded">
        <div className="animate-grow h-2 rounded" style={{ background: color, width: fill }} />
        <div className="bg-signal-alert absolute top-[-4px] left-full h-4 w-0.5" aria-hidden />
      </div>

      {!compact && variant === 'panel' && (
        <>
          <div className="text-chalk-faint mt-[7px] flex justify-between text-[10px] tracking-[0.12em]">
            <span>0 CLEAN</span>
            <span>ALARM THRESHOLD {threshold}</span>
          </div>
          <StatusNote
            error={error}
            message={
              error
                ? "Couldn't refresh the gas reading"
                : lastSpike
                  ? `Last spike ${lastSpike.peak ?? '—'} · ${formatStamp(lastSpike.startedAt)}${
                      lastSpike.notified ? ' · telegram alert sent' : ''
                    }`
                  : 'No gas alarm on record'
            }
            className="mt-2.5 text-[10.5px] tracking-[0.06em] uppercase"
          />
        </>
      )}
    </div>
  )
}
