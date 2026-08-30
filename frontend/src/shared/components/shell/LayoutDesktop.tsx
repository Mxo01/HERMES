import { ErrorBanner } from '@/shared/components/shell/ErrorBanner'
import { Sidebar } from '@/shared/components/shell/Sidebar'
import type { LayoutDesktopProps } from '../../models/shell/LayoutDesktop.model'

/**
 * Full-bleed desktop shell: the dashboard is the window, not a card inside
 * one. Nav lives in the rail on the left, so the content column only ever
 * carries the filters for what's on screen — never a second, competing set
 * of tabs. Fixed to the viewport with the scroll moved onto the content
 * column, so the rail never travels with the page — it's chrome, not content.
 */
export function LayoutDesktop({
  view,
  onViewChange,
  connected,
  alarmCount,
  nodes,
  nodesLoading,
  now,
  retentionNote,
  sidebarCollapsed,
  apiError,
  children,
}: LayoutDesktopProps) {
  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        view={view}
        onViewChange={onViewChange}
        connected={connected}
        alarmCount={alarmCount}
        nodes={nodes}
        nodesLoading={nodesLoading}
        now={now}
        retentionNote={retentionNote}
        collapsed={sidebarCollapsed}
      />
      <div className="min-w-0 flex-1 overflow-y-auto">
        {apiError && (
          <ErrorBanner message="Couldn't reach the HERMES API — some data may be stale or missing." />
        )}
        <main>{children}</main>
      </div>
    </div>
  )
}
