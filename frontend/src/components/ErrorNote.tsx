import { useT } from '../i18n'

interface ErrorNoteProps {
  /** A sentence already written for the user, from lib/errors.ts. */
  message: string
  /** Shows a "Thử lại" button when given. */
  onRetry?: () => void
  /** The retry is in flight: the button is disabled and says so. */
  retrying?: boolean
}

/** A failed request, said once, with an optional retry (DESIGN.md §6.5). */
function ErrorNote({ message, onRetry, retrying = false }: ErrorNoteProps) {
  const t = useT()
  return (
    <div className="note" role="alert">
      {message}
      {onRetry && (
        <button type="button" className="btn-secondary" disabled={retrying} onClick={onRetry}>
          {retrying ? t.common.retrying : t.common.tryAgain}
        </button>
      )}
    </div>
  )
}

export default ErrorNote
