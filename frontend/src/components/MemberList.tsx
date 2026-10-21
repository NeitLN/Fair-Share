import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import type { Member, MemberBalance } from '../api/types'
import { formatVND } from '../lib/money'
import { memberLooks } from '../lib/names'
import type { MemberLook } from '../lib/names'
import { Avatar } from './Avatar'
import { Chip, Stamp } from './Chip'

interface MemberListProps {
  members: Member[]
  /** How each member is shown (lib/names.ts); worked out from `members` when not given. */
  looks?: Map<number, MemberLook>
  /** Each member's balance; undefined while loading or when it could not be loaded (no chips then). */
  balances?: Map<number, MemberBalance>
  /** The member using this device ("Bạn là ai?"), marked "bạn". */
  me?: number | null
  loading: boolean
  /** Loading the members failed. */
  error: string | null
  /** Resolves when saved (edit mode closes), rejects on failure (edit mode stays open). */
  onRename: (id: number, name: string) => Promise<unknown>
  onRemove: (id: number) => void
  /** The member being removed right now: their buttons are disabled so a double click sends one request. */
  removingId?: number | null
  /** A rename or remove that failed, shown under that member's row. */
  rowError?: { id: number; message: string } | null
}

/**
 * A member's money in one chip (DESIGN.md §6.4): cần trả / được nhận with the amount, SẠCH NỢ once
 * they took part in something and are back to 0, nothing for someone who has not taken part yet.
 */
function Standing({ balance }: { balance?: MemberBalance }) {
  if (!balance) return null
  if (balance.net > 0) return <Chip kind="credit">được nhận {formatVND(balance.net)}</Chip>
  if (balance.net < 0) return <Chip kind="debt">cần trả {formatVND(-balance.net)}</Chip>
  const tookPart = balance.paid > 0 || balance.owed > 0 || balance.sent > 0 || balance.received > 0
  return tookPart ? <Stamp kind="settled" decorative={false} /> : null
}

/** Props-only list. Rename/remove are callbacks; the page does the API calls. */
function MemberList({
  members,
  looks: givenLooks,
  balances,
  me = null,
  loading,
  error,
  onRename,
  onRemove,
  removingId = null,
  rowError = null,
}: MemberListProps) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [validation, setValidation] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const looks = useMemo(() => givenLooks ?? memberLooks(members), [givenLooks, members])

  if (loading) {
    return <p className="hint">Đang tải danh sách thành viên…</p>
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

  async function saveEditing(event: FormEvent, id: number) {
    event.preventDefault()
    if (saving) return
    const trimmed = draft.trim()
    if (trimmed.length === 0) {
      setValidation('Tên thành viên không được để trống.')
      return
    }
    setValidation(null)
    setSaving(true)
    try {
      await onRename(id, trimmed)
      setEditingId(null)
    } catch {
      // e.g. 409 duplicate name: the page shows the message under this row; the draft is kept
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="members">
      {error && <p role="alert">{error}</p>}
      {/* An empty list after an error means "could not load", not "no members" */}
      {members.length === 0 ? (
        !error && <p className="empty">Chưa có thành viên nào. Thêm người đầu tiên ở trên.</p>
      ) : (
        <ul className="member-list">
          {members.map((member) => {
            const look = looks.get(member.id)
            const removing = removingId === member.id
            const note = rowError?.id === member.id ? rowError.message : null
            return (
              <li key={member.id} className="member-row">
                {look && <Avatar look={look} size="lg" decorative />}
                {editingId === member.id ? (
                  <form className="member-edit" onSubmit={(e) => saveEditing(e, member.id)} noValidate>
                    <label htmlFor={`member-name-${member.id}`}>Tên mới cho {member.name}</label>
                    <input
                      id={`member-name-${member.id}`}
                      type="text"
                      value={draft}
                      maxLength={40}
                      aria-invalid={validation || note ? true : undefined}
                      aria-describedby={validation || note ? `member-note-${member.id}` : undefined}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setEditingId(null)
                      }}
                    />
                    <button type="submit" disabled={saving}>
                      {saving ? 'Đang lưu…' : 'Lưu'}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setEditingId(null)}>
                      Hủy
                    </button>
                  </form>
                ) : (
                  <div className="who">
                    <strong>
                      {member.name}
                      {me === member.id && <Chip kind="me">bạn</Chip>}
                    </strong>
                    {look && look.short !== member.name.trim() && <small>gọi là {look.short}</small>}
                    <span className="standing">
                      <Standing balance={balances?.get(member.id)} />
                    </span>
                  </div>
                )}
                {editingId !== member.id && (
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn-ghost"
                      aria-label={`Đổi tên ${member.name}`}
                      disabled={removing}
                      onClick={() => startEditing(member)}
                    >
                      Đổi tên
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      aria-label={`Xoá ${member.name}`}
                      disabled={removing}
                      onClick={() => confirmRemove(member)}
                    >
                      {removing ? 'Đang xoá…' : 'Xoá'}
                    </button>
                  </div>
                )}
                {(note || (editingId === member.id && validation)) && (
                  <p id={`member-note-${member.id}`} className="note row-note" role="alert">
                    {editingId === member.id && validation ? validation : note}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default MemberList
