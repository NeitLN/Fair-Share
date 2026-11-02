import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router'

import {
  getHousehold,
  keys,
  leaveHousehold,
  listMembers,
  removeMember,
  removePerson,
  renameMember,
} from '../api/households'
import type { Member } from '../api/types'
import { getBalances, settlementKeys } from '../api/settlements'
import InviteCard from '../components/InviteCard'
import JoinRequests from '../components/JoinRequests'
import MemberList from '../components/MemberList'
import { errorMessage } from '../lib/errors'
import { useMe } from '../lib/identity'
import { memberLooks } from '../lib/names'
import { useT } from '../i18n'

// US-02 with accounts (docs/DESIGN.md §6.4, docs/ACCOUNTS.md): the invite code, the people asking to
// join (owner), and the names in the split. Only the owner renames or removes; anyone else can leave.
function MembersPage() {
  const t = useT()
  const householdId = Number(useParams().householdId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { me } = useMe()
  const household = useQuery({ queryKey: keys.household(householdId), queryFn: () => getHousehold(householdId) })
  const members = useQuery({
    queryKey: keys.members(householdId),
    queryFn: () => listMembers(householdId),
  })
  // Only for the chips (cần trả / được nhận / SẠCH NỢ): if it fails, the list simply has no chips
  const balances = useQuery({
    queryKey: settlementKeys.balances(householdId),
    queryFn: () => getBalances(householdId),
  })
  const isOwner = household.data?.role === 'owner'

  const looks = useMemo(() => memberLooks(members.data ?? []), [members.data])
  const byMember = useMemo(
    () => (balances.data ? new Map(balances.data.balances.map((b) => [b.member_id, b])) : undefined),
    [balances.data],
  )

  // Any change to members can change balances later, so refetch everything under this household
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.household(householdId) })
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => renameMember(id, name, householdId),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: (member: Member) =>
      member.role && member.user_id ? removePerson(householdId, member.user_id) : removeMember(member.id, householdId),
    onSuccess: refresh,
  })
  const leave = useMutation({
    mutationFn: () => leaveHousehold(householdId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: keys.household(householdId) })
      void queryClient.invalidateQueries({ queryKey: keys.households, exact: true })
      navigate('/')
    },
  })

  // A failed rename or remove is explained under that member, not at the top of the page
  const rowError =
    rename.error && rename.variables
      ? { id: rename.variables.id, message: errorMessage(rename.error) ?? '' }
      : remove.error && remove.variables
        ? { id: remove.variables.id, message: errorMessage(remove.error) ?? '' }
        : null
  const people = members.data ?? []

  return (
    <>
      <h2 className="visually-hidden">{t.household.members}</h2>
      <InviteCard householdId={householdId} isOwner={isOwner} />
      {isOwner && <JoinRequests householdId={householdId} members={people} />}
      <MemberList
        members={people}
        looks={looks}
        balances={byMember}
        me={me}
        loading={members.isPending}
        error={errorMessage(members.error)}
        onRetry={() => members.refetch()}
        retrying={members.isFetching}
        canManage={isOwner}
        onRename={(id, name) => {
          remove.reset()
          return rename.mutateAsync({ id, name })
        }}
        onRemove={(id) => {
          rename.reset()
          const member = people.find((m) => m.id === id)
          if (member) remove.mutate(member)
        }}
        onRemoveAccess={(member) => {
          rename.reset()
          remove.mutate(member)
        }}
        removingId={remove.isPending ? remove.variables?.id : null}
        rowError={rowError}
      />
      {household.isSuccess && !isOwner && (
        <p>
          <button
            type="button"
            className="btn-ghost"
            disabled={leave.isPending}
            onClick={() => {
              if (window.confirm(t.people.confirmLeave)) leave.mutate()
            }}
          >
            {t.people.leave}
          </button>
        </p>
      )}
      {leave.error && <p role="alert">{errorMessage(leave.error)}</p>}
    </>
  )
}

export default MembersPage
