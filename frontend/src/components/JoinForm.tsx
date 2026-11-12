import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'

import { join, keys, previewInvite } from '../api/households'
import type { InvitePreview } from '../api/types'
import { errorMessage } from '../lib/errors'
import { useToast } from '../lib/toast'
import { useT } from '../i18n'

const CODE_CHARS = /[^0-9a-z]/gi

/** The code as the server reads it (rule J1): no spaces or dashes, upper case, O as 0, I and L as 1. */
const normalCode = (typed: string) =>
  typed.replace(CODE_CHARS, '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1')

/**
 * "Vào nhà bằng mã mời" (docs/ACCOUNTS.md, J1): the 8 characters the owner sent, typed or filled in
 * from a `/join/CODE` link. Joining waits for the owner, so the answer is usually "request sent"; a
 * member who uses the code again goes straight to the group.
 */
function JoinForm({
  initialCode = '',
  onRequested,
  onPreview,
}: {
  initialCode?: string
  /** The request was sent and now waits for the owner. */
  onRequested?: () => void
  /** What the code in the field leads to: a house, or nothing known (specs/015). */
  onPreview?: (preview: InvitePreview | null) => void
}) {
  const t = useT()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [code, setCode] = useState(initialCode)
  const [problem, setProblem] = useState<string | null>(null)
  // A complete code shows its house before asking (specs/015, FR-004); a wrong one says nothing until
  // it is sent. The answer belongs to that code only: changing the field drops it
  const normal = normalCode(code)
  const previewed = useQuery({
    queryKey: keys.invitePreview(normal),
    queryFn: () => previewInvite(normal),
    enabled: normal.length === 8,
    retry: false,
    staleTime: 60_000,
  })
  const shown = normal.length === 8 ? previewed.data : undefined
  useEffect(() => {
    onPreview?.(shown ?? null)
  }, [shown, onPreview])

  const send = useMutation({
    mutationFn: (typed: string) => join(typed),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: keys.households, exact: true })
      // The waiting card and its 10-second checks come from the person's requests (specs/015)
      void queryClient.invalidateQueries({ queryKey: keys.myRequests })
      if (result.status === 'member' && result.household_id !== null) {
        toast({ text: t.join.already })
        navigate(`/households/${result.household_id}`)
      } else {
        setCode('')
        toast({ text: t.join.sent })
        onRequested?.()
      }
    },
  })

  // The field names everything said about it, so a screen reader reads the problem with the field
  // (specs/017, FR-011)
  const sendProblem = send.error ? errorMessage(send.error) : null
  const describedBy = [
    shown ? 'join-code-preview' : null,
    'join-code-hint',
    problem ? 'join-code-problem' : null,
    sendProblem ? 'join-code-send-problem' : null,
  ]
    .filter(Boolean)
    .join(' ')

  function submit(event: FormEvent) {
    event.preventDefault()
    if (code.replace(CODE_CHARS, '').length !== 8) {
      // The server's last answer is about another code: only the new problem shows (review 12/11, A06)
      send.reset()
      setProblem(t.join.codeProblem)
      return
    }
    setProblem(null)
    send.mutate(code)
  }

  return (
    <form onSubmit={submit} noValidate className="join-form">
      <label htmlFor="join-code">{t.join.codeLabel}</label>
      <input
        id="join-code"
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder={t.join.codePlaceholder}
        value={code}
        maxLength={20}
        disabled={send.isPending}
        aria-invalid={problem ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          setCode(event.target.value)
          // A changed code: what was said about the old one goes (review 12/11, A06)
          if (send.error) send.reset()
          if (problem) setProblem(null)
        }}
      />
      {/* Read once per code by screen readers; empty while there is nothing to say */}
      <p id="join-code-preview" className="join-preview" aria-live="polite">
        {shown && !shown.member && t.join.preview(shown.house_name, shown.owner_name)}
        {shown?.member && (
          <>
            {t.join.alreadyIn} <Link to={`/households/${shown.household_id}`}>{t.join.openHouse}</Link>
          </>
        )}
      </p>
      <p id="join-code-hint" className="hint">
        {t.join.codeHint}
      </p>
      {problem && (
        <p id="join-code-problem" role="alert">
          {problem}
        </p>
      )}
      {sendProblem && (
        <p id="join-code-send-problem" role="alert">
          {sendProblem}
        </p>
      )}
      <button type="submit" className="btn-primary" disabled={send.isPending}>
        {send.isPending ? t.join.submitting : t.join.submit}
      </button>
    </form>
  )
}

export default JoinForm
