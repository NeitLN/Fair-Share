import { useMutation, useMutationState, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

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
import InviteCard from '../components/InviteCard'
import { today } from '../lib/date'
import { filterExpenses, monthTotals, NO_FILTER } from '../lib/expenseFilters'
import { errorMessage } from '../lib/errors'
import { explain } from '../lib/explain'
import { useMe } from '../lib/identity'
import { useSession } from '../lib/session'
import { memberLooks, REMOVED_MEMBER } from '../lib/names'
import { useMemberPhotos } from '../lib/useMemberPhotos'
import { marksAfter, readMarks, recentItems, writeMarks } from '../lib/recent'
import type { SeenMarks } from '../lib/recent'
import { REFRESH_MS } from '../lib/refresh'
import { useToast } from '../lib/toast'
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
  type NoticeAction = { kind: 'send' | 'cancel' | 'decline'; transfer: Transfer }
  const noticeKey = ['notice', householdId]
  const shownVersion = (transfer: Transfer) =>
    notices.data?.find(
      (n) => n.from_member_id === transfer.from_member_id && n.to_member_id === transfer.to_member_id,
    )?.version ?? null
  const notice = useMutation({
    mutationKey: noticeKey,
    mutationFn: ({ kind, transfer }: NoticeAction): Promise<unknown> => {
      const version = shownVersion(transfer)
      if (kind === 'send') return sendNotice(householdId, transfer.to_member_id, transfer.amount, version)
      // Nothing on screen to take back or decline: the screen is old
      if (version === null) return Promise.reject(new ApiError(409, 'notice_changed', t.verdict.noticeGone))
      return kind === 'cancel'
        ? cancelNotice(householdId, transfer.to_member_id, version)
        : declineNotice(householdId, transfer.from_member_id, version)
    },
    onSuccess: (_result, { kind, transfer }) => {
      if (kind === 'send') toast({ text: t.verdict.notified(nameOf(transfer.to_member_id)) })
      if (kind === 'decline') toast({ text: t.verdict.declined(nameOf(transfer.from_member_id)) })
      return refreshNotices()
    },
    // The balances or the notice changed since the page loaded: show what is true now
    onError: (failure) => {
      if (failure instanceof ApiError && failure.status === 409) void refresh()
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
  const record = useMutation({
    mutationFn: (input: SettlementInput) => createSettlement(householdId, input),
    onSuccess: refresh,
    // The notice it pays changed since (409): the form keeps what was typed, the page shows what is true
    onError: (failure) => {
      if (failure instanceof ApiError && failure.status === 409) void refresh()
    },
  })
  const remove = useMutation({
    mutationFn: (settlement: Settlement) => deleteSettlement(settlement.id, householdId),
    onSuccess: (_result, settlement) => {
      // Deleted from the history: a stamped card for it has nothing left to undo
      paid.forget(settlement.id)
      return refresh()
    },
  })

  const memberList = useMemo(() => members.data ?? [], [members.data])
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
    new Set(
      (notices.data ?? [])
        .filter((n) => n.status === 'sent')
        .map((n) => `${n.from_member_id}-${n.to_member_id}`),
    ),
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
            error={errorMessage(record.error)}
            receiver={me}
            notices={notices.data}
          />
        </details>
      )}
      <SettlementList
        settlements={settlements.data ?? []}
        looks={looks}
        loading={settlements.isPending}
        error={errorMessage(settlements.error ?? remove.error)}
        onRetry={settlements.error ? () => settlements.refetch() : undefined}
        retrying={settlements.isFetching}
        onDelete={(settlement) => remove.mutate(settlement)}
        notices={notices.data}
        deletingId={remove.isPending ? remove.variables?.id : null}
        canDelete={(settlement) =>
          household.data?.role === 'owner' || settlement.created_by === session?.user.id
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
            error={paid.error ?? errorMessage(notice.error)}
            reminder={reminder}
            onCopied={() => toast({ text: t.dashboard.reminderCopied })}
            onlyReceiver
            notices={notices.data}
            noticesError={notices.data ? null : errorMessage(notices.error)}
            onRetryNotices={() => notices.refetch()}
            onNotify={(transfer) => notice.mutate({ kind: 'send', transfer })}
            onCancelNotice={(transfer) => notice.mutate({ kind: 'cancel', transfer })}
            onDecline={(transfer) => notice.mutate({ kind: 'decline', transfer })}
            noticeBusy={noticeBusy}
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
