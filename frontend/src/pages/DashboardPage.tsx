import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'

import { keys, listMembers } from '../api/households'
import {
  createSettlement,
  deleteSettlement,
  getBalances,
  listSettlements,
  settlementKeys,
} from '../api/settlements'
import type { Settlement, SettlementInput, Transfer } from '../api/types'
import BalanceTable from '../components/BalanceTable'
import SettlementForm from '../components/SettlementForm'
import SettlementList from '../components/SettlementList'
import SuggestedTransfers from '../components/SuggestedTransfers'
import { today } from '../lib/date'
import { errorMessage } from '../lib/errors'

// US-06, US-07, US-08: who owes whom, how to settle it, and the payments already made
function DashboardPage() {
  const householdId = Number(useParams().householdId)
  const queryClient = useQueryClient()

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

  // A settlement changes the balances: refetch everything cached under this household
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.household(householdId) })
  const record = useMutation({
    mutationFn: (input: SettlementInput) => createSettlement(householdId, input),
    onSuccess: refresh,
  })
  const recordSuggested = useMutation({
    // "Ghi nhận khoản này": the suggested transfer, paid today
    mutationFn: (transfer: Transfer) =>
      createSettlement(householdId, { ...transfer, settled_at: today() }),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (settlement: Settlement) => deleteSettlement(settlement.id),
    onSuccess: refresh,
  })

  const suggested = balances.data?.suggested ?? []
  const recordingIndex = recordSuggested.isPending
    ? suggested.indexOf(recordSuggested.variables)
    : null
  const memberList = members.data ?? []

  if (members.isSuccess && memberList.length === 0) {
    return (
      <>
        <h2 className="visually-hidden">Tổng quan</h2>
        <p>
          Nhà chưa có thành viên. <Link to="members">Thêm thành viên</Link>, rồi ghi các khoản chi
          để xem ai nợ ai.
        </p>
      </>
    )
  }

  return (
    <>
      <h2 className="visually-hidden">Tổng quan</h2>
      {members.error && <p role="alert">{errorMessage(members.error)}</p>}

      <section aria-labelledby="balances-title">
        <h2 id="balances-title">Ai nợ ai</h2>
        <BalanceTable
          balances={balances.data?.balances ?? []}
          loading={balances.isPending}
          error={errorMessage(balances.error)}
        />
      </section>

      <section aria-labelledby="suggested-title">
        <h2 id="suggested-title">Gợi ý chuyển khoản</h2>
        {balances.isSuccess && (
          <SuggestedTransfers
            suggested={suggested}
            members={memberList}
            onRecord={(transfer) => recordSuggested.mutate(transfer)}
            recordingIndex={recordingIndex}
            error={errorMessage(recordSuggested.error)}
          />
        )}
        {balances.isSuccess && suggested.length > 0 && (
          <p className="hint">
            Đã trả theo một dòng gợi ý? Bấm "Ghi nhận khoản này". Trả số khác thì ghi ở form bên
            dưới.
          </p>
        )}
      </section>

      {memberList.length >= 2 && (
        <section aria-labelledby="settlement-form-title">
          <h2 id="settlement-form-title">Ghi nhận khoản trả</h2>
          <SettlementForm
            members={memberList}
            onSubmit={record.mutateAsync}
            submitting={record.isPending}
            error={errorMessage(record.error)}
          />
        </section>
      )}

      <section aria-labelledby="settlements-title">
        <h2 id="settlements-title">Các khoản đã trả</h2>
        <SettlementList
          settlements={settlements.data ?? []}
          members={memberList}
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
