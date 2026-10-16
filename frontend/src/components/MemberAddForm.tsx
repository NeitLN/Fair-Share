import { useState } from 'react'
import type { FormEvent } from 'react'

interface MemberAddFormProps {
  onAdd: (name: string) => void
  submitting: boolean
  error: string | null
}

/** Props-only form. The page passes `onAdd` and shows the result. */
function MemberAddForm({ onAdd, submitting, error }: MemberAddFormProps) {
  const [name, setName] = useState('')
  const [validation, setValidation] = useState<string | null>(null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setValidation('Tên thành viên không được để trống.')
      return
    }
    setValidation(null)
    onAdd(trimmed)
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="member-name">Tên thành viên</label>
      <input
        id="member-name"
        type="text"
        value={name}
        disabled={submitting}
        onChange={(event) => setName(event.target.value)}
      />
      {validation && <p role="alert">{validation}</p>}
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Đang thêm…' : 'Thêm thành viên'}
      </button>
    </form>
  )
}

export default MemberAddForm
