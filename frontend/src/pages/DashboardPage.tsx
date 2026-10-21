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
import type { Settlement, SettlementInput, Transfer } from '../api/types'
import BalanceRows from '../components/BalanceRows'
import SettlementForm from '../components/SettlementForm'
import SettlementList from '../components/SettlementList'
import VerdictBlock from '../components/VerdictBlock'
import { today } from '../lib/date'
import { errorMessage } from '../lib/errors'
import { useMe } from '../lib/identity'
import { memberLooks, REMOVED_MEMBER } from '../lib/names'
import { useToast } from '../lib/toast'
import { reminderMessage, spentInMonth, tookPart } from '../lib/verdict'

// US-06, US-07, US-08: who pays whom, marking it paid, and the payments already made (DESIGN.md §6.2)
function DashboardPage() {
  const householdId = Number(useParams().householdId)
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
  const recordSuggested = useMutation({
    // "Đã trả": the suggested transfer, paid today
    mutationFn: (transfer: Transfer) =>
      createSettlement(householdId, { ...transfer, settled_at: today() }),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (settlement: Settlement) => deleteSettlement(settlement.id),
    onSuccess: refresh,
  })

  const memberList = useMemo(() => members.data ?? [], [members.data])
  const looks = useMemo(() => memberLooks(memberList), [memberList])
  const suggested = balances.data?.suggested ?? []
  const payingIndex = recordSuggested.isPending ? suggested.indexOf(recordSuggested.variables) : null

  if (members.isSuccess && memberList.length === 0) {
    return (
      <>
        <h2 className="visually-hidden">Tổng quan</h2>
        <p className="empty">
          Nhà chưa có thành viên. <Link to="members">Thêm thành viên</Link>, rồi ghi các khoản chi
          để xem ai trả ai.
        </p>
      </>
    )
  }

  const now = today()
  const month = Number(now.slice(5, 7))
  const nameOf = (id: number) => (looks.get(id) ?? REMOVED_MEMBER).short
  const reminder = reminderMessage(
    household.data?.name ?? 'Nhà mình',
    month,
    suggested,
    nameOf,
    `${window.location.origin}/households/${householdId}`,
  )

  return (
    <>
      <h2 className="visually-hidden">Tổng quan</h2>
      {members.error && <p role="alert">{errorMessage(members.error)}</p>}

      <VerdictBlock
        month={month}
        spent={expenses.isSuccess ? spentInMonth(expenses.data, now) : null}
        suggested={suggested}
        me={me}
        looks={looks}
        started={balances.data?.balances.some(tookPart) ?? false}
        loading={balances.isPending}
        loadError={errorMessage(balances.error)}
        onRetry={() => balances.refetch()}
        onPaid={(transfer) => recordSuggested.mutate(transfer)}
        payingIndex={payingIndex}
        error={errorMessage(recordSuggested.error)}
        reminder={reminder}
        onCopied={() => toast({ text: 'Đã sao chép. Dán vào nhóm chat của nhà nhé.' })}
      />

      <Link to="expenses" className="btn-primary cta">
        + Ghi khoản chi
      </Link>

      <section aria-labelledby="balances-title">
        <div className="section-head">
          <h2 id="balances-title">Số dư từng người</h2>
          <span className="section-note">đã chi · cần trả hoặc được nhận</span>
        </div>
        <BalanceRows
          balances={balances.data?.balances ?? []}
          looks={looks}
          me={me}
          loading={balances.isPending}
          error={errorMessage(balances.error)}
        />
      </section>

      <section aria-labelledby="settlements-title">
        <h2 id="settlements-title">Lịch sử trả</h2>
        {memberList.length >= 2 && (
          <details className="fold other-payment">
            <summary>Ghi khoản trả khác</summary>
            <p className="hint">Trả số khác với gợi ý, hoặc trả tiền mặt hôm khác.</p>
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
          onDelete={(settlement) => remove.mutate(settlement)}
          deletingId={remove.isPending ? remove.variables?.id : null}
        />
      </section>
    </>
  )
}

export default DashboardPage
