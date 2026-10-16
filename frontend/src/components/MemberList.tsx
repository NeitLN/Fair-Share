import { useState } from 'react'

import type { Member } from '../api/types'

interface MemberListProps {
  members: Member[]
  loading: boolean
  error: string | null
  /** Resolves when saved (edit mode closes), rejects on failure (edit mode stays open). */
  onRename: (id: number, name: string) => Promise<unknown>
  onRemove: (id: number) => void
}

/** Props-only list. Rename/remove are callbacks; the page does the API calls. */
function MemberList({ members, loading, error, onRename, onRemove }: MemberListProps) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [validation, setValidation] = useState<string | null>(null)

  if (loading) {
    return <p>Đang tải danh sách thành viên…</p>
  }

  function startEditing(member: Member) {
    setEditingId(member.id)
    setDraft(member.name)
    setValidation(null)
  }

  async function saveEditing(id: number) {
    const trimmed = draft.trim()
    if (trimmed.length === 0) {
      setValidation('Tên thành viên không được để trống.')
      return
    }
    setValidation(null)
    try {
      await onRename(id, trimmed)
      setEditingId(null)
    } catch {
      // e.g. 409 duplicate name: the page shows the message, the user can fix the draft
    }
  }

  return (
    <div>
      {error && <p role="alert">{error}</p>}
      {validation && <p role="alert">{validation}</p>}
      {members.length === 0 ? (
        <p>Chưa có thành viên nào — thêm người đầu tiên</p>
      ) : (
        <ul>
          {members.map((member) =>
            editingId === member.id ? (
              <li key={member.id}>
                <label htmlFor={`member-name-${member.id}`}>Tên mới cho {member.name}</label>
                <input
                  id={`member-name-${member.id}`}
                  type="text"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button type="button" onClick={() => saveEditing(member.id)}>
                  Lưu
                </button>
                <button type="button" onClick={() => setEditingId(null)}>
                  Hủy
                </button>
              </li>
            ) : (
              <li key={member.id}>
                {member.name}{' '}
                <button type="button" onClick={() => startEditing(member)}>
                  Đổi tên
                </button>{' '}
                <button type="button" aria-label={`Xoá ${member.name}`} onClick={() => onRemove(member.id)}>
                  Xoá
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  )
}

export default MemberList
