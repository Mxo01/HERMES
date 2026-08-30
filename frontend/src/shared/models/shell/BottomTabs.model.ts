import type { View } from '@/shared/const/view'

export interface BottomTabsProps {
  view: View
  onChange: (view: View) => void
  alarmCount: number
}
