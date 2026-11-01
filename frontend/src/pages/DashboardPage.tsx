import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { Link, useParams } from 'react-router'

import { expenseKeys, listExpenses } from '../api/expenses'
import { getHousehold, keys, listMembers } from '../api/households'
import {
  createSettlement,
  deleteSettlement,
  getBalances,
  listSettlements,
  settlementKeys,
} from '../api/settlements'
import type { Settlement, SettlementInput } from '../api/types'
import BalanceRows from '../components/BalanceRows'
import SettlementForm from '../components/SettlementForm'
import SettlementList from '../components/SettlementList'
import VerdictBlock from '../components/VerdictBlock'
import { today } from '../lib/date'
import { errorMessage } from '../lib/errors'
import { useMe } from '../lib/identity'
import { inviteLink } from '../lib/knownHouseholds'
import { memberLooks, REMOVED_MEMBER } from '../lib/names'
import { useToast } from '../lib/toast'
import { usePaidTransfers } from '../lib/usePaidTransfers'
import { reminderMessage, spentInMonth, tookPart, transferText } from '../lib/verdict'
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
  const toast = useToast()

  // The same queries as the household frame and the other tabs: served from the cache
  const household = useQuery({ queryKey: keys.household(householdId), queryFn: () => getHousehold(householdId) })
  const members = useQuery({
    queryKey: keys.members(householdId),
    queryFn: () => listMembers(householdId),
  })
  const balances = useQuery({
    queryKey: settlementKeys.balances(householdId),
    queryFn: () => getBalances(householdId),
  })
  const settlements = useQuery({
    queryKey: settlementKeys.list(householdId),
    queryFn: () => listSettlements(householdId),
  })
  // Only for "cả nhà đã chi …" this month: if it fails, the line names the month alone
  const expenses = useQuery({
    queryKey: expenseKeys.list(householdId),
    queryFn: () => listExpenses(householdId),
  })

  // A settlement changes the balances: refetch everything cached under this household
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.household(householdId) })
  const record = useMutation({
    mutationFn: (input: SettlementInput) => createSettlement(householdId, input),
    onSuccess: refresh,
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
  // Names come from the members; until they load (or if they fail) the balances carry the same names,
  // so a transfer is never shown as "Thành viên đã xoá" just because its member is not loaded yet
  const looks = useMemo(() => {
    if (members.data) return memberLooks(members.data)
    const fromBalances = (balances.data?.balances ?? []).map((b) => ({
      id: b.member_id,
      household_id: householdId,
      name: b.name,
      created_at: '',
    }))
    return memberLooks(fromBalances)
  }, [members.data, balances.data, householdId])
  const nameOf = (id: number) => (looks.get(id) ?? REMOVED_MEMBER).short
  const paid = usePaidTransfers(householdId, balances.data, (transfer) => transferText(transfer, me, nameOf))
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

  const now = today()
  const month = Number(now.slice(5, 7))
  const reminder = reminderMessage(
    household.data?.name ?? t.dashboard.defaultName,
    month,
    suggested,
    nameOf,
    // The invite link, so everyone in the group chat can open the household
    inviteLink(householdId) ?? `${window.location.origin}/households/${householdId}`,
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

      <VerdictBlock
        month={month}
        spent={expenses.isSuccess ? spentInMonth(expenses.data, now) : null}
        spentUnavailable={expenses.isError}
        suggested={suggested}
        cards={paid.cards}
        me={me}
        looks={looks}
        started={balances.data?.balances.some(tookPart) ?? false}
        loading={balances.isPending}
        // A failed first load replaces the verdict; a failed refresh keeps the last one and says so
        loadError={balances.data ? null : errorMessage(balances.error)}
        refreshError={balances.data ? errorMessage(balances.error) : null}
        onRetry={() => balances.refetch()}
        onPaid={paid.pay}
        onUndo={paid.undo}
        focusIntent={paid.focusIntent}
        onFocusDone={paid.clearFocusIntent}
        error={paid.error}
        reminder={reminder}
        onCopied={() => toast({ text: t.dashboard.reminderCopied })}
      />

      <Link to="expenses" className="btn-primary cta">
        {t.dashboard.addExpense}
      </Link>

      <section aria-labelledby="balances-title">
        <div className="section-head">
          <h2 id="balances-title">{t.dashboard.balancesTitle}</h2>
          <span className="section-note">{t.dashboard.balancesNote}</span>
        </div>
        <BalanceRows
          balances={balances.data?.balances ?? []}
          looks={looks}
          me={me}
          loading={balances.isPending}
          // The verdict block above already says why and offers Thử lại
          unavailable={balances.isError && !balances.data}
        />
      </section>

      <section aria-labelledby="settlements-title">
        <h2 id="settlements-title">{t.dashboard.historyTitle}</h2>
        {memberList.length >= 2 && (
          <details className="fold other-payment" onKeyDown={closeFoldOnEscape}>
            <summary>{t.dashboard.otherPayment}</summary>
            <p className="hint">{t.dashboard.otherPaymentHint}</p>
            <SettlementForm
              members={memberList}
              onSubmit={record.mutateAsync}
              submitting={record.isPending}
              error={errorMessage(record.error)}
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
          deletingId={remove.isPending ? remove.variables?.id : null}
        />
      </section>
    </>
  )
}

export default DashboardPage
