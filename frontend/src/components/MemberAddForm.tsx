import { useState } from 'react'
import type { FormEvent } from 'react'
import { useT } from '../i18n'

interface MemberAddFormProps {
  /** Resolves when saved (the input is cleared), rejects on failure (the text is kept). */
  onAdd: (name: string) => Promise<unknown>
  submitting: boolean
  error: string | null
}

/** Props-only form. The page passes `onAdd` and shows the result. */
function MemberAddForm({ onAdd, submitting, error }: MemberAddFormProps) {
  const t = useT()
  const [name, setName] = useState('')
  const [validation, setValidation] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setValidation(t.members.nameEmpty)
      return
    }
    setValidation(null)
    try {
      await onAdd(trimmed)
      setName('')
    } catch {
      // The page shows the server's message through `error`; keep what the user typed
    }
  }

  return (
    <form className="member-add" onSubmit={handleSubmit}>
      <label htmlFor="member-name">{t.members.nameLabel}</label>
      <input
        id="member-name"
        type="text"
        value={name}
        maxLength={40}
        placeholder={t.members.namePlaceholder}
        aria-describedby="member-name-hint"
        aria-invalid={validation || error ? true : undefined}
        disabled={submitting}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" disabled={submitting}>
        {submitting ? t.members.adding : t.members.add}
      </button>
      <p id="member-name-hint" className="hint">
        {t.members.shortNameHint}
      </p>
      {validation && <p role="alert">{validation}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  )
}

export default MemberAddForm
