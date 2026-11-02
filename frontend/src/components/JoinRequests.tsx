import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { approveRequest, keys, listRequests, rejectRequest } from '../api/households'
import type { JoinRequest, Member } from '../api/types'
import { errorMessage } from '../lib/errors'
import { useToast } from '../lib/toast'
import { useT } from '../i18n'

const NEW = 'new'

/**
 * The owner's answer to people asking to join (docs/ACCOUNTS.md, M1–M3). Approving puts them in the
 * split: under a new name (their display name), or under a name from before accounts that nobody
 * has taken, which keeps that name's expenses and balance.
 */
function JoinRequests({ householdId, members }: { householdId: number; members: Member[] }) {
  const t = useT()
  const id = useId()
  const toast = useToast()
  const queryClient = useQueryClient()
  const requests = useQuery({
    queryKey: keys.requests(householdId),
    queryFn: () => listRequests(householdId),
  })
  const [choices, setChoices] = useState<Record<number, string>>({})
  const free = members.filter((m) => !m.role)

  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.household(householdId) })
  const approve = useMutation({
    mutationFn: (request: JoinRequest) => {
      const choice = choices[request.user_id] ?? NEW
      return approveRequest(householdId, request.user_id, choice === NEW ? {} : { member_id: Number(choice) })
    },
    onSuccess: (_member, request) => {
      toast({ text: t.requests.approved(request.display_name) })
      return refresh()
    },
  })
  const reject = useMutation({
    mutationFn: (request: JoinRequest) => rejectRequest(householdId, request.user_id),
    onSuccess: (_result, request) => {
      toast({ text: t.requests.rejected(request.display_name) })
      return refresh()
    },
  })

  const waiting = requests.data ?? []
  if (waiting.length === 0 && !requests.error) return null
  const busy = approve.isPending || reject.isPending
  const failed = approve.error ?? reject.error

  return (
    <section className="join-requests" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{t.requests.title}</h2>
      <p className="hint">{t.requests.hint}</p>
      {requests.error && <p role="alert">{errorMessage(requests.error)}</p>}
      <ul className="member-list">
        {waiting.map((request) => {
          const selectId = `${id}-as-${request.user_id}`
          return (
            <li key={request.user_id} className="member-row">
              <span className="who">
                <strong>{request.display_name}</strong>
                <small>{request.email}</small>
              </span>
              <label htmlFor={selectId} className="visually-hidden">
                {t.requests.asName}
              </label>
              <select
                id={selectId}
                value={choices[request.user_id] ?? NEW}
                disabled={busy}
                onChange={(event) => setChoices({ ...choices, [request.user_id]: event.target.value })}
              >
                <option value={NEW}>{t.requests.newName(request.display_name)}</option>
                {free.map((m) => (
                  <option key={m.id} value={m.id}>
                    {t.requests.existingName(m.name)}
                  </option>
                ))}
              </select>
              <span className="row-actions">
                <button type="button" className="btn-primary" disabled={busy} onClick={() => approve.mutate(request)}>
                  {approve.isPending && approve.variables?.user_id === request.user_id
                    ? t.requests.approving
                    : t.requests.approve}
                </button>
                <button type="button" className="btn-ghost" disabled={busy} onClick={() => reject.mutate(request)}>
                  {t.requests.reject}
                </button>
              </span>
            </li>
          )
        })}
      </ul>
      {failed && <p role="alert">{errorMessage(failed)}</p>}
    </section>
  )
}

export default JoinRequests
