import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type SyntheticEvent } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'

import { cancelRequest, createHousehold, dismissOutcome, keys, listMyHouseholds } from '../api/households'
import type { InvitePreview } from '../api/types'
import ErrorNote from '../components/ErrorNote'
import HouseholdCreateForm from '../components/HouseholdCreateForm'
import HouseholdList from '../components/HouseholdList'
import JoinForm from '../components/JoinForm'
import Skeleton from '../components/Skeleton'
import { formatDate } from '../lib/date'
import { errorMessage } from '../lib/errors'
import { shortName } from '../lib/names'
import { closeFoldOnEscape } from '../lib/fold'
import { useJoinRequests } from '../lib/useJoinRequests'
import { usePageTitle } from '../lib/usePageTitle'
import { useSession } from '../lib/session'
import { useToast } from '../lib/toast'
import { useT } from '../i18n'

// US-01: the signed-in user's households, creating one, and joining one with an invite code
// (docs/DESIGN.md §6.1, docs/ACCOUNTS.md). Also the page of a `/join/CODE` link, with the code filled in.
// The chevron of a fold in Thêm nhà: it turns when the fold is open (specs/017)
const chevron = (
  <svg className="fold-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="m9 6 6 6-6 6" />
  </svg>
)

/** Opening a fold takes the keyboard to its first field, so focus never stays on a title it just
 * passed or falls to the page (specs/017, FR-007). After paint: the field is shown only then. */
function focusFirstField(event: SyntheticEvent<HTMLDetailsElement>) {
  const fold = event.currentTarget
  if (!fold.open) return
  // Only if it is still open: Escape in the same frame closes it and gives the focus to its title,
  // which must win (a flaky CI run of #279)
  requestAnimationFrame(() => {
    if (fold.open) fold.querySelector<HTMLElement>('input, select, textarea')?.focus()
  })
}

function HouseholdsPage() {
  const t = useT()
  usePageTitle(t.households.title, t.pageTitle)
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  // Just left a house (MembersPage): its pages have unmounted by now, so nothing can fetch its data again.
  // The photos live under their own key (#228 review) and none may stay (#230 review)
  const left = (useLocation().state as { left?: unknown } | null)?.left
  useEffect(() => {
    if (typeof left !== 'number') return
    queryClient.removeQueries({ queryKey: keys.household(left) })
    queryClient.removeQueries({ queryKey: keys.housePhotos(left) })
  }, [left, queryClient])
  const linkCode = useParams().code ?? ''
  const mine = useQuery({ queryKey: keys.households, queryFn: listMyHouseholds })
  // While a request waits, a light check every 10 s with the page in front (specs/015): approved, the
  // house shows up with "Bạn đã vào …"; refused or gone, a line says so until "Đã hiểu"
  const requests = useJoinRequests((request) =>
    toast({
      text: t.pending.joined(request.household_name),
      action: { label: t.pending.open, onAction: () => navigate(`/households/${request.household_id}`) },
    }),
  )
  const dismiss = useMutation({
    mutationFn: dismissOutcome,
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.myRequests }),
  })

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
    onSuccess: (_result, householdId) => {
      toast({ text: t.pending.cancelled })
      setEnded((current) => [...current, householdId])
      void queryClient.invalidateQueries({ queryKey: keys.myRequests })
      return queryClient.invalidateQueries({ queryKey: keys.households, exact: true })
    },
  })

  // With a house or a request, the two ways in wait folded (an invite link opens joining). Once open a
  // fold stays open through a failure and the retry. Someone waiting for approval has done what they
  // came for: the wait is the page, and the two ways in stay folded below it.
  const pending = requests.pending ?? mine.data?.pending ?? []
  const outcomes = requests.outcomes
  const none = mine.isSuccess && mine.data.households.length === 0 && pending.length === 0
  // Arrived with a valid invite: until that request is refused, cancelled or its house deleted, the
  // form that makes a house waits behind "Tạo nhà khác" (specs/015, FR-012)
  const [linkPreview, setLinkPreview] = useState<InvitePreview | null>(null)
  const [ended, setEnded] = useState<number[]>([])
  const [createAnyway, setCreateAnyway] = useState(false)
  // A preview names the house but not its id (it is not the person's yet): an outcome with the same
  // house and owner, or a request cancelled here, ends that invite
  const inviteEnded =
    ended.length > 0 ||
    (linkPreview !== null &&
      outcomes.some((o) => o.household_name === linkPreview.house_name && o.owner_name === linkPreview.owner_name))
  const inviteOn = linkCode !== '' && linkPreview !== null && !linkPreview.member && !inviteEnded
  const outcomeLines = outcomes.length > 0 && (
    <section aria-label={t.pending.endedTitle} className="outcomes">
      <ul className="household-list">
        {outcomes.map((outcome) => (
          <li key={outcome.id} className="outcome-card">
            <span>
              {outcome.kind === 'refused'
                ? t.pending.refused(outcome.owner_name, outcome.household_name)
                : t.pending.houseGone(outcome.household_name)}
            </span>
            <button
              type="button"
              className="btn-ghost"
              disabled={dismiss.isPending}
              onClick={() => dismiss.mutate(outcome.id)}
            >
              {t.pending.gotIt}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
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
  const name = shortName(useSession()?.user.display_name ?? '')
  const onRequested = () => {
    setJoining(false)
    setCreating(false)
    requested.current = true
  }
  // Came by an invite link while already in a house: the code is the reason for the visit, so the page
  // brings it into view and puts the keyboard in it, once (specs/017, FR-009)
  const broughtToCode = useRef(false)
  const returning = mine.isSuccess && !none
  useEffect(() => {
    if (!returning || linkCode === '' || broughtToCode.current) return
    broughtToCode.current = true
    requestAnimationFrame(() => {
      // Only while nothing else has the keyboard: a request sent in the same frame has already moved it
      // to the wait, and that must win (a flaky CI run of #287)
      const active = document.activeElement
      if (active && active !== document.body) return
      const field = document.getElementById('join-code')
      field?.scrollIntoView?.({ block: 'center' })
      field?.focus()
    })
  }, [returning, linkCode])

  // Until the list is known nothing else shows: a form typed into now would be swapped for the start
  // below, or for the folded one, as soon as it loads
  if (mine.isPending) {
    return (
      <>
        <h1>{t.households.title}</h1>
        <Skeleton label={t.households.loading} rows={2} />
      </>
    )
  }

  // A new account: one place to start, the two ways in side by side with what each one leads to
  // (design review 05/11: a grey line on the left and a lone code field on the right read as nothing to do)
  if (none) {
    return (
      <>
        <h1>{t.households.title}</h1>
        {/* How earlier requests ended, until "Đã hiểu" (specs/015) */}
        {outcomeLines}
        <section aria-labelledby="start-title" className="start">
          <h2 id="start-title">{t.start.title(name)}</h2>
          <p className="hint">{t.households.howItWorks}</p>
          <div className="start-ways">
            <section aria-labelledby="start-join" className="start-way">
              <h3 id="start-join">{t.start.joinTitle}</h3>
              <p className="hint">{t.start.joinHint}</p>
              <JoinForm initialCode={linkCode} onRequested={onRequested} onPreview={setLinkPreview} />
            </section>
            {inviteOn && !createAnyway ? (
              // Came from an invite: no second, empty house by mistake (specs/015, FR-012)
              <p className="start-way">
                <button type="button" className="btn-ghost" onClick={() => setCreateAnyway(true)}>
                  {t.start.createAnyway}
                </button>
              </p>
            ) : (
              <section aria-labelledby="start-create" className="start-way">
                <h3 id="start-create">{t.start.createTitle}</h3>
                <p className="hint">{t.start.createHint}</p>
                <HouseholdCreateForm
                  onCreate={create.mutateAsync}
                  submitting={create.isPending}
                  error={errorMessage(create.error)}
                />
              </section>
            )}
          </div>
        </section>
      </>
    )
  }

  return (
    <>
      <h1>{t.households.title}</h1>
      {/* On a computer the houses and the wait on the left, the ways in on the right from 1280 px; under
          them below that, so the keyboard meets them in the order they are seen (specs/017, FR-006) */}
      <div className="page-split households-split">
        <div className="split-lead">
          {mine.error && (
            <ErrorNote message={errorMessage(mine.error) ?? ''} onRetry={() => mine.refetch()} retrying={mine.isFetching} />
          )}
          {showList && <HouseholdList households={mine.data.households} />}
          {outcomeLines}

          {pending.length > 0 && (
            <section aria-labelledby="pending-title" className="pending">
              <h2 id="pending-title" ref={pendingTitle} tabIndex={-1}>
                {t.pending.title}
              </h2>
              <ul className="household-list">
                {/* One card per request: where it stands and what can be done about it, together */}
                {pending.map((request) => (
                  <li key={request.household_id} className="pending-card">
                    <span className="pending-row">
                      {request.household_name
                        ? `${t.pending.waitingFor(request.household_name, request.owner_name)} · ${t.pending.sentOn(
                            formatDate(request.requested_at.slice(0, 10)),
                          )}`
                        : t.pending.row(formatDate(request.requested_at.slice(0, 10)))}
                    </span>
                    <span className="pending-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={requests.checking}
                        onClick={requests.check}
                      >
                        {requests.checking ? t.pending.checking : t.pending.check}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={cancel.isPending}
                        aria-label={request.household_name ? t.pending.cancelFor(request.household_name) : undefined}
                        onClick={() => cancel.mutate(request.household_id)}
                      >
                        {t.pending.cancel}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="hint">{t.pending.hint}</p>
              {cancel.error && <p role="alert">{errorMessage(cancel.error)}</p>}
            </section>
          )}
        </div>

        {/* The titles stay in view when a fold is open, so it says it is open and can be closed again
            (specs/017, FR-007). The two help lines are gone for people with a house: the invite one now
            sits in the create fold, where it becomes true (FR-004, FR-008) */}
        <section className="split-rest ways-in" aria-labelledby="ways-in-title">
          <h2 id="ways-in-title">{t.households.addTitle}</h2>
          <details
            className="fold join-household"
            open={joining}
            onToggle={(event) => {
              // Follows the fold both ways: its title stays in view, so a click can close it too (#278 review)
              setJoining(event.currentTarget.open)
              focusFirstField(event)
            }}
            onKeyDown={(event) => {
              if (closeFoldOnEscape(event)) setJoining(false)
            }}
          >
            <summary>
              {t.join.open}
              {chevron}
            </summary>
            <JoinForm initialCode={linkCode} onRequested={onRequested} onPreview={setLinkPreview} />
          </details>
          <details
            className="fold create-household"
            open={creating}
            onToggle={(event) => {
              setCreating(event.currentTarget.open)
              focusFirstField(event)
            }}
            onKeyDown={(event) => {
              if (closeFoldOnEscape(event)) setCreating(false)
            }}
          >
            <summary>
              {t.households.newHousehold}
              {chevron}
            </summary>
            <HouseholdCreateForm
              onCreate={create.mutateAsync}
              submitting={create.isPending}
              error={errorMessage(create.error)}
              hint={t.households.inviteHint}
            />
          </details>
        </section>
      </div>
    </>
  )
}

export default HouseholdsPage
