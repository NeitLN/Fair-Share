import { useState } from 'react'
import type { FormEvent } from 'react'

interface HouseholdCreateFormProps {
  onCreate: (name: string) => void
  submitting: boolean
  error: string | null
}

/** Props-only form. The page passes `onCreate` and shows the result. */
function HouseholdCreateForm({ onCreate, submitting, error }: HouseholdCreateFormProps) {
  const [name, setName] = useState('')
  const [validation, setValidation] = useState<string | null>(null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length < 1 || trimmed.length > 60) {
      setValidation('Tên nhà phải từ 1 đến 60 ký tự.')
      return
    }
    setValidation(null)
    onCreate(trimmed)
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="household-name">Tên nhà</label>
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
        {submitting ? 'Đang tạo…' : 'Tạo nhà'}
      </button>
    </form>
  )
}

export default HouseholdCreateForm
