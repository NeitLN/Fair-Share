import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router'

import { addMember, keys, listMembers, removeMember, renameMember } from '../api/households'
import MemberAddForm from '../components/MemberAddForm'
import MemberList from '../components/MemberList'
import { errorMessage } from '../lib/errors'

// US-02: add, rename and remove the members of one household
function MembersPage() {
  const householdId = Number(useParams().householdId)
  const queryClient = useQueryClient()
  const members = useQuery({
    queryKey: keys.members(householdId),
    queryFn: () => listMembers(householdId),
  })

  // Any change to members can change balances later, so refetch everything under this household
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.household(householdId) })
  const add = useMutation({ mutationFn: (name: string) => addMember(householdId, name), onSuccess: refresh })
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => renameMember(id, name),
    onSuccess: refresh,
  })
  const remove = useMutation({ mutationFn: removeMember, onSuccess: refresh })

  return (
    <>
      <h1>Thành viên</h1>
      <MemberAddForm
        onAdd={add.mutateAsync}
        submitting={add.isPending}
        error={errorMessage(add.error)}
      />
      <MemberList
        members={members.data ?? []}
        loading={members.isPending}
        error={errorMessage(members.error ?? rename.error ?? remove.error)}
        onRename={(id, name) => {
          remove.reset()
          return rename.mutateAsync({ id, name })
        }}
        onRemove={(id) => {
          rename.reset()
          remove.mutate(id)
        }}
        removingId={remove.isPending ? remove.variables : null}
      />
    </>
  )
}

export default MembersPage
