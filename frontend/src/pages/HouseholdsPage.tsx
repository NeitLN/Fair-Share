import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { cancelRequest, createHousehold, keys, listMyHouseholds } from '../api/households'
import ErrorNote from '../components/ErrorNote'
import HouseholdCreateForm from '../components/HouseholdCreateForm'
import HouseholdList from '../components/HouseholdList'
import JoinForm from '../components/JoinForm'
import Skeleton from '../components/Skeleton'
import { formatDate } from '../lib/date'
import { errorMessage } from '../lib/errors'
import { closeFoldOnEscape } from '../lib/fold'
import { useToast } from '../lib/toast'
import { useT } from '../i18n'

// US-01: the signed-in user's households, creating one, and joining one with an invite code
// (docs/DESIGN.md §6.1, docs/ACCOUNTS.md). Also the page of a `/join/CODE` link, with the code filled in.
function HouseholdsPage() {
  const t = useT()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const linkCode = useParams().code ?? ''
  const mine = useQuery({ queryKey: keys.households, queryFn: listMyHouseholds })

  const create = useMutation({
    mutationFn: createHousehold,
    onSuccess: (household) => {
      // Shown at once with its name, then the members page to invite people
      queryClient.setQueryData(keys.household(household.id), household)
      void queryClient.invalidateQueries({ queryKey: keys.households, exact: true })
      navigate(`/households/${household.id}/members`)
    },
  })
  const cancel = useMutation({
    mutationFn: cancelRequest,
    onSuccess: () => {
      toast({ text: t.pending.cancelled })
      return queryClient.invalidateQueries({ queryKey: keys.households, exact: true })
    },
  })

  // Nothing yet: both ways in start open. Once open (by the user, or because the list was empty) a
  // fold stays open through a failure and the retry. Someone waiting for approval has done what
  // they came for: the wait is the page, and the two ways in stay folded below it.
  const pending = mine.data?.pending ?? []
  const none = mine.isSuccess && mine.data.households.length === 0 && pending.length === 0
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(linkCode !== '')
  // Sent a request just now: the forms fold and focus goes to the wait once it shows
  const pendingTitle = useRef<HTMLHeadingElement>(null)
  const requested = useRef(false)
  useEffect(() => {
    if (requested.current && pending.length > 0) {
      requested.current = false
      pendingTitle.current?.focus()
    }
  }, [pending.length])
  // "Bạn chưa ở nhà nào" above a request that is waiting read like a refusal
  const showList = mine.isSuccess && (mine.data.households.length > 0 || pending.length === 0)

  return (
    <>
      <h1>{t.households.title}</h1>
      {mine.isPending && <Skeleton label={t.households.loading} rows={2} />}
      {mine.error && (
        <ErrorNote message={errorMessage(mine.error) ?? ''} onRetry={() => mine.refetch()} retrying={mine.isFetching} />
      )}
      {showList && <HouseholdList households={mine.data.households} />}

      {pending.length > 0 && (
        <section aria-labelledby="pending-title" className="pending">
          <h2 id="pending-title" ref={pendingTitle} tabIndex={-1}>
            {t.pending.title}
          </h2>
          <ul className="household-list">
            {pending.map((request) => (
              <li key={request.household_id}>
                <span className="household-row pending-row">
                  {t.pending.row(formatDate(request.requested_at.slice(0, 10)))}
                </span>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(request.household_id)}
                >
                  {t.pending.cancel}
                </button>
              </li>
            ))}
          </ul>
          <p className="hint">{t.pending.hint}</p>
          {cancel.error && <p role="alert">{errorMessage(cancel.error)}</p>}
        </section>
      )}

      <details
        className="fold join-household"
        open={none || joining}
        onToggle={(event) => {
          if (event.currentTarget.open) setJoining(true)
        }}
        onKeyDown={(event) => {
          if (!none && closeFoldOnEscape(event)) setJoining(false)
        }}
      >
        <summary className="btn-secondary">{t.join.open}</summary>
        <JoinForm
          initialCode={linkCode}
          onRequested={() => {
            setJoining(false)
            setCreating(false)
            requested.current = true
          }}
        />
      </details>
      <details
        className="fold create-household"
        open={none || creating}
        onToggle={(event) => {
          if (event.currentTarget.open) setCreating(true)
        }}
        onKeyDown={(event) => {
          if (!none && closeFoldOnEscape(event)) setCreating(false)
        }}
      >
        <summary className="btn-secondary">{t.households.newHousehold}</summary>
        <HouseholdCreateForm
          onCreate={create.mutateAsync}
          submitting={create.isPending}
          error={errorMessage(create.error)}
        />
      </details>
      <p className="hint">{t.households.inviteHint}</p>
      <p className="hint">{t.households.howItWorks}</p>
    </>
  )
}

export default HouseholdsPage
