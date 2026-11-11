import { useState } from 'react'
import type { FormEvent } from 'react'
import { useT } from '../i18n'

interface HouseholdCreateFormProps {
  /** Resolves when saved (the input is cleared), rejects on failure (the text is kept). */
  onCreate: (name: string) => Promise<unknown>
  submitting: boolean
  error: string | null
  /** A line under the name field, such as what to do once the house is made (specs/017, FR-008). */
  hint?: string
}

/** Props-only form. The page passes `onCreate` and shows the result. */
function HouseholdCreateForm({ onCreate, submitting, error, hint }: HouseholdCreateFormProps) {
  const t = useT()
  const [name, setName] = useState('')
  const [validation, setValidation] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setValidation(t.households.nameEmpty)
      return
    }
    if (trimmed.length > 60) {
      setValidation(t.households.nameProblem)
      return
    }
    setValidation(null)
    try {
      await onCreate(trimmed)
      setName('')
    } catch {
      // The page shows the server's message through `error`; keep what the user typed
    }
  }

  // The field names its hint and any problem, so they are read with it (specs/017, FR-011)
  const describedBy = [
    hint ? 'household-name-hint' : null,
    validation ? 'household-name-problem' : null,
    error ? 'household-name-error' : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="household-name">{t.households.nameLabel}</label>
      <input
        id="household-name"
        type="text"
        value={name}
        maxLength={60}
        disabled={submitting}
        aria-invalid={validation ? true : undefined}
        aria-describedby={describedBy || undefined}
        onChange={(event) => setName(event.target.value)}
      />
      {hint && (
        <p id="household-name-hint" className="hint">
          {hint}
        </p>
      )}
      {validation && (
        <p id="household-name-problem" role="alert">
          {validation}
        </p>
      )}
      {error && (
        <p id="household-name-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={submitting}>
        {submitting ? t.households.creating : t.households.create}
      </button>
    </form>
  )
}

export default HouseholdCreateForm
