import { cn } from '@/shared/utils/cn'
import type { StatusNoteProps } from '../../models/common/StatusNote.model'

/**
 * The single line of text a panel shows in place of its content — empty,
 * loading, or a failed request. Centralizes the tone decision (red only for
 * a real error) that every panel needs but none should redecide on its own;
 * layout stays with the caller via `className`. For a chart's own canvas,
 * use `ChartStatus` instead — this is for a note living inside a panel that
 * already has other content around it.
 */
export function StatusNote({ error, message, className }: StatusNoteProps) {
  return (
    <p
      className={cn(error ? 'text-signal-alert' : 'text-chalk-faint', className)}
      title={error?.message}
    >
      {message}
    </p>
  )
}
