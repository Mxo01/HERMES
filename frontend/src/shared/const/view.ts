import { Activity, Bell, History, type LucideIcon } from 'lucide-react'

export type View = 'live' | 'history' | 'alarms'

export const MOBILE_VIEWS: View[] = ['live', 'history', 'alarms']

/** Alarms live inside the live view on desktop, where there is room for the table. */
export const DESKTOP_VIEWS: View[] = ['live', 'history']

/** One glyph per view, so the nav reads before its label does. */
export const VIEW_ICONS: Record<View, LucideIcon> = {
  live: Activity,
  history: History,
  alarms: Bell,
}
