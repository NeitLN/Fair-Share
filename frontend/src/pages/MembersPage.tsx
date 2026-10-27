import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useParams } from 'react-router'

import { addMember, keys, listMembers, removeMember, renameMember } from '../api/households'
import { getBalances, settlementKeys } from '../api/settlements'
import InviteLink from '../components/InviteLink'
import MemberAddForm from '../components/MemberAddForm'
import MemberList from '../components/MemberList'
import { errorMessage } from '../lib/errors'
import { useMe } from '../lib/identity'
import { memberLooks } from '../lib/names'

// US-02: add, rename and remove the members of one household (docs/DESIGN.md §6.4)
function MembersPage() {
  const householdId = Number(useParams().householdId)
  const queryClient = useQueryClient()
  const { me } = useMe()
  const members = useQuery({
    queryKey: keys.members(householdId),
    queryFn: () => listMembers(householdId),
  })
  // Only for the chips (cần trả / được nhận / SẠCH NỢ): if it fails, the list simply has no chips
  const balances = useQuery({
    queryKey: settlementKeys.balances(householdId),
    queryFn: () => getBalances(householdId),
  })

  const looks = useMemo(() => memberLooks(members.data ?? []), [members.data])
  const byMember = useMemo(
    () => (balances.data ? new Map(balances.data.balances.map((b) => [b.member_id, b])) : undefined),
    [balances.data],
  )

  // Any change to members can change balances later, so refetch everything under this household
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.household(householdId) })
  const add = useMutation({ mutationFn: (name: string) => addMember(householdId, name), onSuccess: refresh })
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => renameMember(id, name, householdId),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (id: number) => removeMember(id, householdId),
    onSuccess: refresh,
  })

  // A failed rename or remove is explained under that member, not at the top of the page
  const rowError =
    rename.error && rename.variables
      ? { id: rename.variables.id, message: errorMessage(rename.error) ?? '' }
      : remove.error && remove.variables !== undefined
        ? { id: remove.variables, message: errorMessage(remove.error) ?? '' }
        : null

  return (
    <>
      <h2 className="visually-hidden">Thành viên</h2>
      <InviteLink householdId={householdId} />
      <MemberAddForm
        onAdd={add.mutateAsync}
        submitting={add.isPending}
        error={errorMessage(add.error)}
      />
      <MemberList
        members={members.data ?? []}
        looks={looks}
        balances={byMember}
        me={me}
        loading={members.isPending}
        error={errorMessage(members.error)}
        onRetry={() => members.refetch()}
        retrying={members.isFetching}
        onRename={(id, name) => {
          remove.reset()
          return rename.mutateAsync({ id, name })
        }}
        onRemove={(id) => {
          rename.reset()
          remove.mutate(id)
        }}
        removingId={remove.isPending ? remove.variables : null}
        rowError={rowError}
      />
    </>
  )
}

export default MembersPage
