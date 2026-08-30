import { BottomTabs } from '@/shared/components/shell/BottomTabs'
import { ErrorBanner } from '@/shared/components/shell/ErrorBanner'
import { formatClock } from '@/shared/utils/format'
import { cn } from '@/shared/utils/cn'
import type { LayoutMobileProps } from '../../models/shell/LayoutMobile.model'

/**
 * The phone shell: identity/status header, the error banner, the active
 * view, and the bottom tab bar. Tuned for ~390px — on a tablet it is centred
 * and capped rather than stretched, so line lengths and the hero number keep
 * the proportions the design calls for.
 */
export function LayoutMobile({
  view,
  onViewChange,
  connected,
  now,
  retentionRawDays,
  apiError,
  alarmCount,
  children,
}: LayoutMobileProps) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col">
      {view !== 'alarms' && (
        <header className="flex items-center justify-between px-[18px] pt-3.5 pb-2.5">
          <span className="text-[12px] font-semibold tracking-[0.3em]">
            {view === 'history' ? 'HISTORY' : 'HERMES'}
          </span>
          <div className="text-chalk-soft flex items-center gap-2.5 text-[10px] tracking-[0.1em]">
            {view === 'history' ? (
              <span>RAW {retentionRawDays}D → HOURLY</span>
            ) : (
              <>
                <span
                  className={cn(
                    'flex items-center gap-1.5',
                    connected ? 'text-signal-ok' : 'text-signal-alert',
                  )}
                >
                  <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-current" aria-hidden />
                  {connected ? 'LIVE' : 'OFFLINE'}
                </span>
                <span className="tabular">{formatClock(now)}</span>
              </>
            )}
          </div>
        </header>
      )}

      {apiError && (
        <ErrorBanner
          message="Couldn't reach the HERMES API — some data may be stale or missing."
          compact
        />
      )}

      {/* The tab bar is fixed, out of this flow entirely, so it no longer
          gives the last section clearance on its own — pb-24 stands in
          for the space it would otherwise take up. */}
      <main className="pb-24">{children}</main>

      <BottomTabs view={view} onChange={onViewChange} alarmCount={alarmCount} />
    </div>
  )
}
