import { useState } from 'react'
import type { FormEvent } from 'react'
import { useT } from '../i18n'

interface HouseholdCreateFormProps {
  /** Resolves when saved (the input is cleared), rejects on failure (the text is kept). */
  onCreate: (name: string) => Promise<unknown>
  submitting: boolean
  error: string | null
}

/** Props-only form. The page passes `onCreate` and shows the result. */
function HouseholdCreateForm({ onCreate, submitting, error }: HouseholdCreateFormProps) {
  const t = useT()
  const [name, setName] = useState('')
  const [validation, setValidation] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length < 1 || trimmed.length > 60) {
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

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="household-name">{t.households.nameLabel}</label>
      <input
        id="household-name"
        type="text"
        value={name}
        maxLength={60}
        disabled={submitting}
        onChange={(event) => setName(event.target.value)}
      />
      {validation && <p role="alert">{validation}</p>}
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? t.households.creating : t.households.create}
      </button>
    </form>
  )
}

export default HouseholdCreateForm
