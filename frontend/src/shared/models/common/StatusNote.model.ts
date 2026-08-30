export interface StatusNoteProps {
  /** A failed request colors the note red; anything else uses the muted tone. */
  error?: Error
  message: string
  className?: string
}
