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
import HouseholdRename from '../components/HouseholdRename'
import InviteCard from '../components/InviteCard'
import JoinRequests from '../components/JoinRequests'
import MemberList from '../components/MemberList'
import { errorMessage } from '../lib/errors'
import { useMe } from '../lib/identity'
import { memberLooks } from '../lib/names'
import { useMemberPhotos } from '../lib/useMemberPhotos'
import { useWide } from '../lib/useWide'
import { useT } from '../i18n'

// US-02 with accounts (docs/DESIGN.md §6.4, docs/ACCOUNTS.md): the invite code, the people asking to
// join (owner), and the names in the split. Only the owner renames or removes; anyone else can leave.
function MembersPage() {
  const t = useT()
  const wide = useWide()
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

  const photos = useMemberPhotos(householdId, members.data)
  const looks = useMemo(() => memberLooks(members.data ?? [], photos), [members.data, photos])
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
      navigate('/')
      // Once the house's pages are gone: removed while they were still on screen, their queries came back
      // at once and could fetch the photos again, so the house you left kept them (a test failing now
      // and then, 08/11). The photos live under their own key (#228 review) and none may stay (#230 review)
      setTimeout(() => {
        queryClient.removeQueries({ queryKey: keys.household(householdId) })
        queryClient.removeQueries({ queryKey: keys.housePhotos(householdId) })
      }, 0)
      void queryClient.invalidateQueries({ queryKey: keys.households, exact: true })
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

  const invite = (
    <>
      <InviteCard householdId={householdId} isOwner={isOwner} />
      {isOwner && household.data && <HouseholdRename householdId={householdId} name={household.data.name} />}
    </>
  )
  const requests = isOwner && <JoinRequests householdId={householdId} members={people} />
  const list = (
    <section aria-labelledby="people-title">
      <h2 id="people-title">{t.people.listTitle(people.length)}</h2>
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
    </section>
  )

  return (
    <>
      {/* Someone waiting to be approved first, then the people, then the invite (DESIGN.md §6.4); a
          computer puts the people in the wide column and the request and the invite beside them */}
      <div className="page-split members-split">
        {wide ? (
          <>
            <div className="split-lead">{list}</div>
            <div className="split-rest">
              {requests}
              {invite}
            </div>
          </>
        ) : (
          <>
            <div className="split-lead">
              {requests}
              {list}
            </div>
            <div className="split-rest">{invite}</div>
          </>
        )}
      </div>
    </>
  )
}

export default MembersPage
