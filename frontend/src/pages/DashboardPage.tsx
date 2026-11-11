import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'

import { ApiError } from '../api/client'
import { Link, useParams } from 'react-router'

import { expenseKeys, listExpenses } from '../api/expenses'
import { getHousehold, keys, listMembers, listRequests } from '../api/households'
import {
  cancelNotice,
  createSettlement,
  declineNotice,
  deleteSettlement,
  getBalances,
  listNotices,
  listSettlements,
  sendNotice,
  addToNotice,
  settlementKeys,
} from '../api/settlements'
import type { Settlement, SettlementInput, Transfer } from '../api/types'
import BalanceRows from '../components/BalanceRows'
import MonthTotals from '../components/MonthTotals'
import BalanceExplanation from '../components/BalanceExplanation'
import RecentExpenses from '../components/RecentExpenses'
import RecentStrip from '../components/RecentStrip'
import DueCard from '../components/DueCard'
import { listRecurring, recurringKeys } from '../api/recurring'
import { dueItems } from '../lib/recurring'
import SettlementForm from '../components/SettlementForm'
import SettlementList from '../components/SettlementList'
import Skeleton from '../components/Skeleton'
import VerdictBlock from '../components/VerdictBlock'
import type { NoticePart } from '../components/VerdictBlock'
import InviteCard from '../components/InviteCard'
import { today } from '../lib/date'
import { filterExpenses, monthTotals, NO_FILTER } from '../lib/expenseFilters'
import { errorMessage } from '../lib/errors'
import { formatVND } from '../lib/money'
import { outcomeLine, savedDraft } from '../lib/saveOutcome'
import { classify, raceOf, snapshot } from '../lib/notices'
import type { RaceSnapshot } from '../lib/notices'
import { BUSY_HOUSE } from '../lib/folds'
import { explain } from '../lib/explain'
import { useMe } from '../lib/identity'
import { useSession } from '../lib/session'
import { memberLooks, REMOVED_MEMBER } from '../lib/names'
import { useMemberPhotos } from '../lib/useMemberPhotos'
import { marksAfter, readMarks, recentItems, writeMarks } from '../lib/recent'
import type { SeenMarks } from '../lib/recent'
import { REFRESH_MS } from '../lib/refresh'
import { useSaveFeedback, useToast, useVisibleSaveError } from '../lib/toast'
import { usePaidTransfers } from '../lib/usePaidTransfers'
import { useWide } from '../lib/useWide'
import { reminderMessage, tookPart, transferText } from '../lib/verdict'
import ErrorNote from '../components/ErrorNote'
import { closeFoldOnEscape } from '../lib/fold'
import { useT } from '../i18n'

// US-06, US-07, US-08: who pays whom, marking it paid, and the payments already made (DESIGN.md §6.2)
function DashboardPage() {
  const householdId = Number(useParams().householdId)
  // One household per mount: the payments just recorded and their toasts never leak into another one
  return <Dashboard key={householdId} householdId={householdId} />
}

function Dashboard({ householdId }: { householdId: number }) {
  const t = useT()
  const queryClient = useQueryClient()
  const { me } = useMe()
  const session = useSession()
  const toast = useToast()
  const wide = useWide()

  // The same queries as the household frame and the other tabs: served from the cache
  const household = useQuery({ queryKey: keys.household(householdId), queryFn: () => getHousehold(householdId) })
  const members = useQuery({
    queryKey: keys.members(householdId),
    queryFn: () => listMembers(householdId),
  })
  // Asked again while the page is open (lib/refresh.ts): a housemate's "Đã nhận" settles your card
  const balances = useQuery({
    queryKey: settlementKeys.balances(householdId),
    queryFn: () => getBalances(householdId),
    refetchInterval: REFRESH_MS,
  })
  // Balances cached before an expense was saved on another tab are out of date: until they are fetched
  // again they show as loading, never as the answer ("Chưa có khoản chi nào", 0đ for everyone). A refresh
  // started here, after "Đã trả", keeps the last answer on screen as before.
  const [outdatedOnOpen] = useState(
    () => queryClient.getQueryState(settlementKeys.balances(householdId))?.isInvalidated ?? false,
  )
  const [openedAt] = useState(() => Date.now())
  const balancesOutdated = outdatedOnOpen && balances.dataUpdatedAt < openedAt && !balances.isError
  const settlements = useQuery({
    queryKey: settlementKeys.list(householdId),
    queryFn: () => listSettlements(householdId),
    refetchInterval: REFRESH_MS,
  })
  // Only for "cả nhà đã chi …" this month: if it fails, the line names the month alone
  const expenses = useQuery({
    queryKey: expenseKeys.list(householdId),
    queryFn: () => listExpenses(householdId),
  })

  // "Tôi đã chuyển" (docs/ACCOUNTS.md, S3). Until they load, nothing that depends on them is pressed:
  // Đã nhận must record the told amount, and nobody tells twice
  const notices = useQuery({
    queryKey: settlementKeys.notices(householdId),
    queryFn: () => listNotices(householdId),
  })

  // A house with one person points at the next real step: inviting someone (spec 012, US3). Only its
  // owner can have join requests waiting, and only they may read them.
  const alone = members.data?.length === 1
  const requests = useQuery({
    queryKey: keys.requests(householdId),
    queryFn: () => listRequests(householdId),
    enabled: alone && household.data?.role === 'owner',
  })

  // A settlement changes the balances: refetch everything cached under this household
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.household(householdId) })
  const refreshNotices = () => queryClient.invalidateQueries({ queryKey: settlementKeys.notices(householdId) })
  // Every notice action names the version of the pair's notice as this screen shows it (none: null); a
  // notice that changed since is left alone (409 notice_changed, specs/014)
  // `part`: an amount from a step ("Chuyển số khác", "Báo thêm"), with its note; a blank note is sent as
  // none when telling, and left out (the old note stays) when adding
  type NoticeAction = { kind: 'send' | 'add' | 'cancel' | 'decline'; transfer: Transfer; part?: NoticePart }
  const noticeKey = ['notice', householdId]
  // Answered after this page left: no toast, but the household is still refreshed (specs/018, research R8)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  // The words for a notice action that was not sent, or whose answer never came (specs/018, A3 to A5)
  const feedback = useSaveFeedback()
  const pairSource = (transfer: Transfer) => `transfer-${transfer.from_member_id}-${transfer.to_member_id}`
  const noticeOf = (transfer: Transfer) =>
    notices.data?.find((n) => n.from_member_id === transfer.from_member_id && n.to_member_id === transfer.to_member_id)
  // After a refusal because the notice changed: what the fresh data proves happened, for 10 s or until the
  // next press (specs/019, FR-020)
  const [race, setRace] = useState<{ line: string } | null>(null)
  const raceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const clearRace = () => {
    clearTimeout(raceTimer.current)
    setRace(null)
  }
  useEffect(() => () => clearTimeout(raceTimer.current), [])
  async function explainRace(transfer: Transfer, before: RaceSnapshot | undefined) {
    const [fresh, history] = await Promise.all([notices.refetch(), settlements.refetch()])
    void refresh()
    if (!alive.current) return
    notice.reset()
    let line = t.notices.raceChanged
    if (fresh.isError || history.isError) line = t.notices.raceUnread
    else if (before) {
      const now = fresh.data?.find(
        (n) => n.from_member_id === transfer.from_member_id && n.to_member_id === transfer.to_member_id,
      )
      const to = nameOf(transfer.to_member_id)
      const what = raceOf(before, { from: transfer.from_member_id, to: transfer.to_member_id }, now, history.data ?? [])
      // A decline on a pair that is not suggested is said on its card (FR-004a): only "changed" here
      const unmatched = now !== undefined && classify(now, balances.data?.suggested ?? []).kind === 'unmatched'
      if (what.kind === 'declined' && !unmatched) line = t.notices.raceDeclined(to, formatVND(what.amount))
      if (what.kind === 'confirmed') line = t.notices.raceConfirmed(to, formatVND(what.amount))
      if (what.kind === 'takenBack') line = t.notices.raceTakenBack
    }
    clearTimeout(raceTimer.current)
    setRace({ line })
    raceTimer.current = setTimeout(() => setRace(null), 10_000)
  }
  const noticeLine = (kind: NoticeAction['kind'], failure: unknown) =>
    outcomeLine(kind === 'cancel' ? 'A4' : kind === 'decline' ? 'A5' : 'A3', failure, t)
  const shownVersion = (transfer: Transfer) =>
    notices.data?.find(
      (n) => n.from_member_id === transfer.from_member_id && n.to_member_id === transfer.to_member_id,
    )?.version ?? null
  const notice = useMutation({
    mutationKey: noticeKey,
    mutationFn: ({ kind, transfer, part }: NoticeAction): Promise<unknown> => {
      const version = shownVersion(transfer)
      const note = part?.note?.trim() ? part.note : undefined
      if (kind === 'send')
        return sendNotice(householdId, transfer.to_member_id, part?.amount ?? transfer.amount, version, note)
      // Nothing on screen to take back or decline: the screen is old
      if (version === null) return Promise.reject(new ApiError(409, 'notice_changed', t.verdict.noticeGone))
      if (kind === 'add') return addToNotice(householdId, transfer.to_member_id, { amount: part?.amount ?? 0, version, note })
      return kind === 'cancel'
        ? cancelNotice(householdId, transfer.to_member_id, version)
        : declineNotice(householdId, transfer.from_member_id, version)
    },
    meta: { householdId },
    // A new press on this pair takes away its last "Đã báo" nobody is using (specs/018, FR-012), and what
    // the page showed is kept, to say afterwards who did what if it is refused (specs/019, FR-020)
    onMutate: ({ transfer }) => {
      feedback.started(pairSource(transfer))
      clearRace()
      return { before: snapshot(noticeOf(transfer), settlements.data) }
    },
    onSuccess: (_result, { kind, transfer }) => {
      const tag = { kind: 'success', source: pairSource(transfer) } as const
      if (alive.current && (kind === 'send' || kind === 'add')) toast({ ...tag, text: t.verdict.notified(nameOf(transfer.to_member_id)) })
      if (alive.current && kind === 'decline') toast({ ...tag, text: t.verdict.declined(nameOf(transfer.from_member_id)) })
      // Done when the write is: the refresh is not waited for (specs/018, FR-010)
      void refreshNotices()
    },
    // The balances or the notice changed since the page loaded: show what is true now, and say what
    // happened when the fresh data proves it (specs/019, FR-020)
    onError: (failure, { transfer }, context) => {
      if (failure instanceof ApiError && failure.status === 409) void explainRace(transfer, context?.before)
      if (failure instanceof ApiError && failure.code === 'outcome_unknown') unknownSince.current.set(pairSource(transfer), Date.now())
    },
  })
  // Every pair with a notice press on its way, not only the latest one
  const noticeBusy = useMutationState({
    filters: { mutationKey: noticeKey, status: 'pending' },
    select: (mutation) => {
      const { transfer } = mutation.state.variables as NoticeAction
      return `${transfer.from_member_id}-${transfer.to_member_id}`
    },
  })
  // One press per pair at a time, whichever control it comes from, including after a "result unknown"
  // until the notices have been read again (specs/019, FR-019)
  const pressing = useRef(new Set<string>())
  const unknownSince = useRef(new Map<string, number>())
  const pairBusy = (transfer: Transfer) => {
    const key = pairSource(transfer)
    const unknown = unknownSince.current.get(key)
    if (unknown !== undefined && notices.dataUpdatedAt > unknown) unknownSince.current.delete(key)
    return (
      pressing.current.has(key) ||
      unknownSince.current.has(key) ||
      paid.cards.some(
        (card) =>
          card.state === 'paying' &&
          card.transfer.from_member_id === transfer.from_member_id &&
          card.transfer.to_member_id === transfer.to_member_id,
      )
    )
  }
  const press = <T,>(transfer: Transfer, run: () => Promise<T>): Promise<T> | undefined => {
    if (pairBusy(transfer)) return undefined
    const key = pairSource(transfer)
    pressing.current.add(key)
    return run().finally(() => pressing.current.delete(key))
  }
  const act = (kind: NoticeAction['kind'], transfer: Transfer) =>
    void press(transfer, () => notice.mutateAsync({ kind, transfer }).catch(() => undefined))
  // From a step: the refusal is said there, with what was typed (null once told). A press the pair
  // guard ignores answers undefined: the step stays as it is, nothing was told (review of #296)
  const tellPart = (kind: 'send' | 'add', transfer: Transfer, part: NoticePart): Promise<string | null> | undefined =>
    press(transfer, () =>
      notice.mutateAsync({ kind, transfer, part }).then(
        () => null,
        (failure: unknown) => noticeLine(kind, failure) ?? errorMessage(failure) ?? t.common.tryAgain,
      ),
    )
  const record = useMutation({
    mutationFn: (input: SettlementInput) => createSettlement(householdId, input),
    meta: { householdId },
    onSuccess: () => void refresh(),
    // The notice it pays changed since (409): the form keeps what was typed, the page shows what is true
    onError: (failure) => {
      if (failure instanceof ApiError && failure.status === 409) void refresh()
    },
  })
  /** "Xem" on a repayment already recorded (specs/020, FR-009): read the history, then scroll to its row. */
  async function showSettlement(id: number) {
    await settlements.refetch()
    requestAnimationFrame(() => {
      const row = document.getElementById(`settlement-${id}`)
      // A busy house folds the history: open it first
      const fold = row?.closest('details')
      if (fold && !fold.open) fold.open = true
      const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      row?.scrollIntoView?.({ behavior: still ? 'auto' : 'smooth', block: 'center' })
    })
  }
  const remove = useMutation({
    mutationFn: (settlement: Settlement) => deleteSettlement(settlement.id, householdId),
    meta: { householdId },
    onSuccess: (_result, settlement) => {
      // Deleted from the history: a stamped card for it has nothing left to undo
      paid.forget(settlement.id)
      void refresh()
    },
  })

  const memberList = useMemo(() => members.data ?? [], [members.data])
  // Each member's receiving-account hint, for "Mở mã QR" (specs/016-vietqr)
  const receivingHints = useMemo(
    () => new Map(memberList.map((m) => [m.id, m.receiving_hint ?? null])),
    [memberList],
  )
  // "Vì sao ra số này?": each balance explained from what the page already has (specs/002-balance-explanation)
  const explanations = useMemo(
    () =>
      new Map(
        (balances.data?.balances ?? []).map((b) => [
          b.member_id,
          explain(b, expenses.data ?? [], settlements.data ?? [], notices.data ?? []),
        ]),
      ),
    [balances.data, expenses.data, settlements.data, notices.data],
  )
  const mine = me === null ? undefined : explanations.get(me)
  // Names come from the members; until they load (or if they fail) the balances carry the same names,
  // so a transfer is never shown as "Thành viên đã xoá" just because its member is not loaded yet
  const photos = useMemberPhotos(householdId, members.data)
  const looks = useMemo(() => {
    if (members.data) return memberLooks(members.data, photos)
    const fromBalances = (balances.data?.balances ?? []).map((b) => ({
      id: b.member_id,
      household_id: householdId,
      name: b.name,
      created_at: '',
    }))
    return memberLooks(fromBalances)
  }, [members.data, balances.data, householdId, photos])
  const nameOf = (id: number) => (looks.get(id) ?? REMOVED_MEMBER).short

  // "Đến ngày ghi" (specs/007-recurring-expenses): worked out here from the items and the expenses; nothing
  // while either is loading or failed
  const recurring = useQuery({
    queryKey: recurringKeys.list(householdId),
    queryFn: () => listRecurring(householdId),
  })
  const due = recurring.isSuccess && expenses.isSuccess ? dueItems(recurring.data, expenses.data, today()) : []

  // "Mới ghi" (specs/006-recently-added): built only from complete data (members, expenses and
  // repayments all loaded), and "Đánh dấu đã xem hết" marks from exactly the lists it was built from
  const userId = session?.user.id ?? null
  const [marks, setMarks] = useState<SeenMarks | null>(() => (userId === null ? null : readMarks(userId, householdId)))
  // The first-visit window (7 days) counts from when the page opened
  const [openedOn] = useState(() => new Date())
  const complete = members.isSuccess && expenses.isSuccess && settlements.isSuccess && userId !== null
  const recent = complete
    ? recentItems(expenses.data, settlements.data, members.data, userId, marks, openedOn)
    : []
  const markSeen = () => {
    if (!complete) return
    const next = marksAfter(expenses.data, settlements.data, marks)
    setMarks(next)
    writeMarks(userId, householdId, next)
  }
  // Its toasts ("Đã ghi: …", "Đã hoàn tác: …") are about a payment made, so they read as done
  const paid = usePaidTransfers(householdId, balances.data, (transfer) => transferText(transfer, me, nameOf, true))
  // Without the transfers already marked paid, even before the refetched balances arrive
  const suggested = paid.outstanding

  // Each money write says it in its own place; while one shows, no "saved" toast stands beside it
  // (specs/018, FR-012, FR-016)
  // The draft already recorded another repayment: said in the page's words, with Xem (specs/020, FR-009)
  const recordSaved = savedDraft(record.error)
  const recordError = recordSaved
    ? t.save.draftSaved.settlement
    : record.error
      ? (outcomeLine('A2', record.error, t) ?? errorMessage(record.error))
      : null
  const removeError = remove.error ? (outcomeLine('A7', remove.error, t) ?? errorMessage(remove.error)) : null
  const noticeError =
    notice.error && notice.variables && !notice.variables.part
      ? (noticeLine(notice.variables.kind, notice.error) ?? errorMessage(notice.error))
      : null
  const panelError = race?.line ?? paid.error ?? noticeError
  useVisibleSaveError(recordError)
  useVisibleSaveError(removeError)
  useVisibleSaveError(panelError)

  if (members.isSuccess && memberList.length === 0) {
    return (
      <>
        <h2 className="visually-hidden">{t.household.overview}</h2>
        <p className="empty">
          {t.dashboard.noMembers(<Link to="members">{t.dashboard.addMembers}</Link>)}
        </p>
      </>
    )
  }

  // One person: the money sections would all be zeros, and the next real step is to invite someone
  if (alone) {
    const waiting = requests.data?.length ?? 0
    return (
      <>
        <h2 className="visually-hidden">{t.household.overview}</h2>
        <div className="alone-house">
          <Link to="expenses" state={{ focus: 'description' }} className="btn-primary cta cta-add">
            {t.dashboard.addExpense}
          </Link>
          <p className="hint">{t.dashboard.inviteLead}</p>
          <InviteCard householdId={householdId} isOwner={household.data?.role === 'owner'} />
          {waiting > 0 && (
            <p>
              <Link to="members">{t.dashboard.waitingToJoin(waiting)}</Link>
            </p>
          )}
        </div>
      </>
    )
  }

  // A busy house (plan G2-10): what is about you stays, the rest of the house folds
  const fold = memberList.length >= BUSY_HOUSE ? householdId : undefined

  const now = today()
  const month = Number(now.slice(5, 7))
  const thisMonth = now.slice(0, 7)
  const reminder = reminderMessage(
    household.data?.name ?? t.dashboard.defaultName,
    month,
    suggested,
    nameOf,
    // The household's page: everyone in the group chat is a member and opens it signed in
    `${window.location.origin}/households/${householdId}`,
    (notices.data ?? []).filter((n) => n.status === 'sent'),
  )

  // Lịch sử trả: under the balances on a phone, under the verdict on a computer (DESIGN.md §6.6)
  const history = (
    <section aria-labelledby="settlements-title">
      <h2 id="settlements-title">{t.dashboard.historyTitle}</h2>
      {memberList.length >= 2 && me !== null && (
        <details className="fold other-payment" onKeyDown={closeFoldOnEscape}>
          <summary>{t.dashboard.otherPayment}</summary>
          <p className="hint">{t.dashboard.otherPaymentHint}</p>
          <SettlementForm
            members={memberList}
            onSubmit={record.mutateAsync}
            submitting={record.isPending}
            error={recordError}
            receiver={me}
            notices={notices.data}
            alreadySaved={recordSaved}
            onShowSaved={(id) => void showSettlement(id)}
          />
        </details>
      )}
      <SettlementList
        settlements={settlements.data ?? []}
        looks={looks}
        loading={settlements.isPending}
        error={settlements.error ? errorMessage(settlements.error) : removeError}
        onRetry={settlements.error ? () => settlements.refetch() : undefined}
        retrying={settlements.isFetching}
        onDelete={(settlement) => remove.mutate(settlement)}
        notices={notices.data}
        deletingId={remove.isPending ? remove.variables?.id : null}
        fold={fold}
        // While its stamped card offers Hoàn tác, a repayment has one undo, not two (specs/019, FR-016)
        canDelete={(settlement) =>
          !paid.undoable.has(settlement.id) &&
          (household.data?.role === 'owner' || settlement.created_by === session?.user.id)
        }
      />
    </section>
  )

  return (
    <>
      <h2 className="visually-hidden">{t.household.overview}</h2>
      {members.error && (
        <ErrorNote
          message={errorMessage(members.error) ?? ''}
          onRetry={() => members.refetch()}
          retrying={members.isFetching}
        />
      )}

      {/* Side by side on a computer: who pays whom and the repayments on the left, where everyone stands
          and the latest expenses on the right */}
      <div className="page-split dashboard-split">
        <div className="split-lead">
          {/* Logging an expense is the first job: before the verdict, however long it gets. Filled but
              without the sticker shadow, so it does not shout with the block under it (DESIGN.md §6.2) */}
          <Link to="expenses" state={{ focus: 'description' }} className="btn-primary cta cta-add">
            {t.dashboard.addExpense}
          </Link>
          <VerdictBlock
            explanation={
              mine && mine.net !== 0 ? (
                <BalanceExplanation explanation={mine} looks={looks} me={me} householdId={householdId} />
              ) : undefined
            }
            suggested={suggested}
            owed={paid.owed}
            cards={paid.cards}
            me={me}
            looks={looks}
            started={balances.data?.balances.some(tookPart) ?? false}
            loading={balances.isPending || balancesOutdated}
            // A failed first load replaces the verdict; a failed refresh keeps the last one and says so
            loadError={balances.data ? null : errorMessage(balances.error)}
            refreshError={balances.data ? errorMessage(balances.error) : null}
            onRetry={() => balances.refetch()}
            onPaid={paid.pay}
            onUndo={paid.undo}
            focusIntent={paid.focusIntent}
            onFocusDone={paid.clearFocusIntent}
            // A refusal from a step is said in the step
            error={panelError}
            reminder={reminder}
            onCopied={() => toast({ text: t.dashboard.reminderCopied })}
            onlyReceiver
            notices={notices.data}
            noticesError={notices.data ? null : errorMessage(notices.error)}
            onRetryNotices={() => notices.refetch()}
            onNotify={(transfer, part) => (part ? tellPart('send', transfer, part) : act('send', transfer))}
            onAddToNotice={(transfer, part) => tellPart('add', transfer, part)}
            onCancelNotice={(transfer) => act('cancel', transfer)}
            onDecline={(transfer) => act('decline', transfer)}
            noticeBusy={noticeBusy}
            foldOthers={fold}
            householdId={householdId}
            receivingHints={receivingHints}
          />
          {/* Under the transfers: another money action, so the right column (and Báo cáo tháng) stays put */}
          <DueCard items={due} looks={looks} householdId={householdId} />
          {wide && history}
        </div>

        <div className="split-rest">
          {/* First on the right on a computer; after the verdict and its transfers on a phone */}
          <RecentStrip
            items={recent}
            looks={looks}
            me={me}
            householdId={householdId}
            initialCount={wide ? 3 : 5}
            onSeen={markSeen}
          />
          {/* This month on its own, apart from the balances, which add up everything since the start */}
          {expenses.isSuccess && (
            <MonthTotals
              month={thisMonth}
              totals={monthTotals(filterExpenses(expenses.data, { ...NO_FILTER, month: thisMonth }), memberList)}
              looks={looks}
              me={me}
              level={2}
              reportTo={`/households/${householdId}/report/${thisMonth}`}
              fold={fold}
            />
          )}
          {/* Holds the place while the expenses load, so the balances below do not jump (review of #172) */}
          {expenses.isPending && <Skeleton label={t.dashboard.monthLoading} rows={3} />}
          {expenses.isError && <p className="hint">{t.verdict.month(month) + t.verdict.spentUnavailable}</p>}
          <section aria-labelledby="balances-title">
            <div className="section-head">
              <h2 id="balances-title">{t.dashboard.balancesTitle}</h2>
              <span className="section-note">{t.dashboard.balancesNote}</span>
            </div>
            <BalanceRows
              balances={balances.data?.balances ?? []}
              looks={looks}
              me={me}
              loading={balances.isPending || balancesOutdated}
              // The verdict block above already says why and offers Thử lại
              unavailable={balances.isError && !balances.data}
              explanations={explanations}
              householdId={householdId}
              fold={fold !== undefined}
            />
          </section>
          {!wide && history}
          {wide && (
            <RecentExpenses
              expenses={expenses.data}
              members={memberList}
              looks={looks}
              loading={expenses.isPending}
              error={errorMessage(expenses.error)}
              onRetry={() => expenses.refetch()}
              retrying={expenses.isFetching}
            />
          )}
        </div>
      </div>
    </>
  )
}

export default DashboardPage
