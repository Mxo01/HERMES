import type { LucideIcon } from 'lucide-react'

export interface TabItem<T extends string> {
  id: T
  label: string
  /** When set, the selected tab uses this as its background. */
  accent?: string
  /** Shown before the label — lets a tab read at a glance, label or not. */
  icon?: LucideIcon
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[]
  value: T
  onChange: (id: T) => void
  /** `room` is the larger, brighter switch; `metric` the smaller accented one. */
  tone?: 'room' | 'metric'
  /** `fill` spreads the tabs across the full width — used on the phone layout. */
  layout?: 'inline' | 'fill'
  label?: string
}
