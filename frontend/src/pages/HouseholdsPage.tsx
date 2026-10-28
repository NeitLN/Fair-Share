import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { ApiError } from '../api/client'
import { createHousehold, getHousehold, keys } from '../api/households'
import HouseholdCreateForm from '../components/HouseholdCreateForm'
import HouseholdList from '../components/HouseholdList'
import type { KnownHousehold } from '../components/HouseholdList'
import { errorMessage } from '../lib/errors'
import { closeFoldOnEscape } from '../lib/fold'
import { forget, putBack, readKnown, remember } from '../lib/knownHouseholds'
import { useToast } from '../lib/toast'

const gone = (error: unknown) => error instanceof ApiError && error.status === 404

// US-01: the households this browser knows, and creating one (docs/DESIGN.md §6.1). The API does not
// list every household (#132): this browser keeps the ones it created or opened, with their keys.
function HouseholdsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [known, setKnown] = useState(readKnown)
  // The same query the household frame uses, so opening one from here is instant
  const loaded = useQueries({
    queries: known.map((id) => ({ queryKey: keys.household(id), queryFn: () => getHousehold(id) })),
  })

  // A household that answers 404 was deleted: it leaves this browser's list for good
  useEffect(() => {
    known.forEach((id, index) => {
      if (gone(loaded[index]?.error)) forget(id)
    })
  }, [known, loaded])

  const households: KnownHousehold[] = known
    .map((id, index) => {
      const query = loaded[index]
      return {
        id,
        name: query?.data?.name,
        loading: query?.isPending ?? true,
        gone: gone(query?.error),
        error: query?.error && !gone(query.error) ? errorMessage(query.error) : null,
      }
    })
    .filter((household) => !household.gone)

  const create = useMutation({
    mutationFn: createHousehold,
    onSuccess: (household) => {
      // The key comes only in this answer: keep it, or the household could not be opened again
      remember(household.id, household.key)
      // A new household has nobody in it yet: go straight to adding members
      navigate(`/households/${household.id}/members`)
    },
  })

  function forgetOne(household: KnownHousehold) {
    const forgotten = forget(household.id)
    setKnown(readKnown())
    // What was loaded goes too: a made-up invite link must not show it from the cache
    queryClient.removeQueries({ queryKey: keys.household(household.id) })
    const label = household.name ?? `Nhà #${household.id}`
    toast({
      text: `Đã bỏ ${label} khỏi danh sách trên máy này`,
      action: {
        label: 'Hoàn tác',
        onAction: () => {
          putBack(household.id, forgotten)
          setKnown(readKnown())
        },
      },
    })
  }

  // Nothing known yet: the form is the only thing to do, so it starts open. Once open (by the user,
  // or because the list was empty) it stays open through a failure and the retry.
  const none = households.length === 0
  const [creating, setCreating] = useState(false)

  return (
    <>
      <h1>Nhà của bạn</h1>
      <HouseholdList
        households={households}
        onRetry={(id) => loaded[known.indexOf(id)]?.refetch()}
        onForget={forgetOne}
      />
      <details
        className="fold create-household"
        open={none || creating}
        onToggle={(event) => {
          if (event.currentTarget.open) setCreating(true)
        }}
        onKeyDown={(event) => {
          if (!none && closeFoldOnEscape(event)) setCreating(false)
        }}
      >
        <summary className="btn-secondary">+ Tạo nhà mới</summary>
        <HouseholdCreateForm
          onCreate={create.mutateAsync}
          submitting={create.isPending}
          error={errorMessage(create.error)}
        />
      </details>
      <p className="hint">
        Mời bạn cùng phòng bằng đường dẫn mời (trong Thành viên): mở nó một lần là nhà hiện ở đây trên máy
        của họ.
      </p>
      <p className="hint">Ghi khoản chi lúc vừa trả. Cuối tháng app tự tính ai trả ai, ít lần chuyển nhất.</p>
    </>
  )
}

export default HouseholdsPage
