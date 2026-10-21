import { useState } from 'react'
import type { FormEvent } from 'react'

interface MemberAddFormProps {
  /** Resolves when saved (the input is cleared), rejects on failure (the text is kept). */
  onAdd: (name: string) => Promise<unknown>
  submitting: boolean
  error: string | null
}

/** Props-only form. The page passes `onAdd` and shows the result. */
function MemberAddForm({ onAdd, submitting, error }: MemberAddFormProps) {
  const [name, setName] = useState('')
  const [validation, setValidation] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setValidation('Tên thành viên không được để trống.')
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
      <label htmlFor="member-name">Tên thành viên</label>
      <input
        id="member-name"
        type="text"
        value={name}
        maxLength={40}
        placeholder="Họ tên, ví dụ: Trần Thị Thanh Hương"
        aria-describedby="member-name-hint"
        aria-invalid={validation || error ? true : undefined}
        disabled={submitting}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" disabled={submitting}>
        {submitting ? 'Đang thêm…' : 'Thêm thành viên'}
      </button>
      <p id="member-name-hint" className="hint">
        App gọi mỗi người bằng tên cuối: Hương, Minh, Anh…
      </p>
      {validation && <p role="alert">{validation}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  )
}

export default MemberAddForm
