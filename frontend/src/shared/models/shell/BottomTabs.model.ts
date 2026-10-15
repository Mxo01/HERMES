import type { View } from '@/shared/const/view'

export interface BottomTabsProps {
  view: View
  onChange: (view: View) => void
  /** Alarms still open; the Alarms tab shows a badge while there are any. */
  activeAlarms: number
}
