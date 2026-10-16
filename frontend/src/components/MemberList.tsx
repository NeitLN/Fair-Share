import { useState } from 'react'

import type { Member } from '../api/types'

interface MemberListProps {
  members: Member[]
  loading: boolean
  error: string | null
  /** Resolves when saved (edit mode closes), rejects on failure (edit mode stays open). */
  onRename: (id: number, name: string) => Promise<unknown>
  onRemove: (id: number) => void
  /** The member being removed right now: their buttons are disabled so a double click sends one request. */
  removingId?: number | null
}

/** Props-only list. Rename/remove are callbacks; the page does the API calls. */
function MemberList({
  members,
  loading,
  error,
  onRename,
  onRemove,
  removingId = null,
}: MemberListProps) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [validation, setValidation] = useState<string | null>(null)

  if (loading) {
    return <p>Đang tải danh sách thành viên…</p>
  }

  // Removing cannot be undone from the UI, so ask first
  function confirmRemove(member: Member) {
    if (window.confirm(`Xoá ${member.name} khỏi nhà?`)) onRemove(member.id)
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
      {/* An empty list after an error means "could not load", not "no members" */}
      {members.length === 0 ? (
        !error && <p>Chưa có thành viên nào — thêm người đầu tiên.</p>
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
                <button
                  type="button"
                  disabled={removingId === member.id}
                  onClick={() => startEditing(member)}
                >
                  Đổi tên
                </button>{' '}
                <button
                  type="button"
                  aria-label={`Xoá ${member.name}`}
                  disabled={removingId === member.id}
                  onClick={() => confirmRemove(member)}
                >
                  {removingId === member.id ? 'Đang xoá…' : 'Xoá'}
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
