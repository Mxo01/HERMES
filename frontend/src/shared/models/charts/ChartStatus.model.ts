import type { LucideIcon } from 'lucide-react'

export interface ChartStatusProps {
  loading: boolean
  error?: Error
  /** Shown once loading has finished and there was no error — genuinely nothing to draw. */
  emptyLabel: string
  /** A glyph that reads as "this chart, empty" rather than a generic no-data mark. */
  emptyIcon?: LucideIcon
  /**
   * `spacious` fills a dedicated canvas: a big glyph over a small label,
   * centred. `compact` is for a single line with no room to spare — label
   * only, the icon would just be noise.
   */
  size?: 'spacious' | 'compact'
  className?: string
}
