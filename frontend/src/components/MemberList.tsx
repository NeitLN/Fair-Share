import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import type { Member, MemberBalance } from '../api/types'
import { formatVND } from '../lib/money'
import { memberLooks } from '../lib/names'
import type { MemberLook } from '../lib/names'
import { tookPart } from '../lib/verdict'
import { Avatar } from './Avatar'
import { Chip, Stamp } from './Chip'
import ErrorNote from './ErrorNote'
import Skeleton from './Skeleton'
import { useT } from '../i18n'

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
  /** Reloads after a failed load; shows Thử lại next to the error. */
  onRetry?: () => void
  /** The reload is running: Thử lại is disabled. */
  retrying?: boolean
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
  const t = useT()
  if (!balance) return null
  if (balance.net > 0) return <Chip kind="credit">{t.money.gets(formatVND(balance.net))}</Chip>
  if (balance.net < 0) return <Chip kind="debt">{t.money.owes(formatVND(-balance.net))}</Chip>
  return tookPart(balance) ? <Stamp kind="settled" decorative={false} /> : null
}

/** Props-only list. Rename/remove are callbacks; the page does the API calls. */
function MemberList({
  members,
  looks: givenLooks,
  balances,
  me = null,
  loading,
  error,
  onRetry,
  retrying = false,
  onRename,
  onRemove,
  removingId = null,
  rowError = null,
}: MemberListProps) {
  const t = useT()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [validation, setValidation] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const looks = useMemo(() => givenLooks ?? memberLooks(members), [givenLooks, members])
  // Keyboard focus follows the edit: into the field when it opens, back to that row's button after
  const renameButtons = useRef(new Map<number, HTMLButtonElement>())
  const editInput = useRef<HTMLInputElement>(null)
  const returnFocusTo = useRef<number | null>(null)

  useEffect(() => {
    if (editingId !== null) {
      editInput.current?.focus()
      return
    }
    if (returnFocusTo.current !== null) {
      renameButtons.current.get(returnFocusTo.current)?.focus()
      returnFocusTo.current = null
    }
  }, [editingId])

  if (loading) {
    return <Skeleton label={t.members.loading} />
  }

  // Removing cannot be undone from the UI, so ask first
  function confirmRemove(member: Member) {
    if (window.confirm(t.members.confirmRemove(member.name))) onRemove(member.id)
  }

  // While a rename is being saved nothing else may open or close an editor: its answer belongs to it
  function stopEditing() {
    if (saving) return
    returnFocusTo.current = editingId
    setEditingId(null)
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
      setValidation(t.members.nameEmpty)
      return
    }
    setValidation(null)
    setSaving(true)
    try {
      await onRename(id, trimmed)
      returnFocusTo.current = id
      setEditingId(null)
    } catch {
      // e.g. 409 duplicate name: the page shows the message under this row; the draft is kept
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="members">
      {error && <ErrorNote message={error} onRetry={onRetry} retrying={retrying} />}
      {/* An empty list after an error means "could not load", not "no members" */}
      {members.length === 0 ? (
        !error && <p className="empty">{t.members.empty}</p>
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
                    <label htmlFor={`member-name-${member.id}`}>{t.members.newNameLabel(member.name)}</label>
                    <input
                      ref={editInput}
                      id={`member-name-${member.id}`}
                      type="text"
                      value={draft}
                      maxLength={40}
                      aria-invalid={validation || note ? true : undefined}
                      aria-describedby={validation || note ? `member-note-${member.id}` : undefined}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') stopEditing()
                      }}
                    />
                    <button type="submit" disabled={saving}>
                      {saving ? t.common.saving : t.common.save}
                    </button>
                    <button type="button" className="btn-secondary" disabled={saving} onClick={stopEditing}>
                      {t.common.cancel}
                    </button>
                  </form>
                ) : (
                  <div className="who">
                    <strong>
                      {member.name}
                      {me === member.id && <Chip kind="me">{t.common.you}</Chip>}
                    </strong>
                    {look && look.short !== member.name.trim() && <small>{t.members.calledAs(look.short)}</small>}
                    <span className="standing">
                      <Standing balance={balances?.get(member.id)} />
                    </span>
                  </div>
                )}
                {editingId !== member.id && (
                  <div className="row-actions">
                    <button
                      ref={(button) => {
                        if (button) renameButtons.current.set(member.id, button)
                        else renameButtons.current.delete(member.id)
                      }}
                      type="button"
                      className="btn-ghost"
                      aria-label={t.members.renameLabel(member.name)}
                      disabled={removing || saving}
                      onClick={() => startEditing(member)}
                    >
                      {t.members.rename}
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      aria-label={t.members.removeLabel(member.name)}
                      aria-describedby={note ? `member-note-${member.id}` : undefined}
                      disabled={removing}
                      onClick={() => confirmRemove(member)}
                    >
                      {removing ? t.members.removing : t.members.remove}
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
