import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { createHousehold, keys, listHouseholds } from '../api/households'
import HouseholdCreateForm from '../components/HouseholdCreateForm'
import HouseholdList from '../components/HouseholdList'
import { errorMessage } from '../lib/errors'

// US-01: list households and create one (docs/DESIGN.md §6.1: the list first, creating is folded)
function HouseholdsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const households = useQuery({ queryKey: keys.households, queryFn: listHouseholds })

  const create = useMutation({
    mutationFn: createHousehold,
    onSuccess: (household) => {
      queryClient.invalidateQueries({ queryKey: keys.households })
      // A new household has nobody in it yet: go straight to adding members
      navigate(`/households/${household.id}/members`)
    },
  })

  // Nobody has a household yet: the form is the only thing to do, so it starts open. Once open (by
  // the user, or because the list was empty) it stays open through a failure and the retry.
  const none = households.isSuccess && households.data.length === 0
  const [creating, setCreating] = useState(false)

  return (
    <>
      <h1>Nhà của bạn</h1>
      <HouseholdList
        households={households.data ?? []}
        loading={households.isPending}
        // Vietnamese like every other page (it used to show the server's English text)
        error={errorMessage(households.error)}
        onRetry={() => households.refetch()}
        retrying={households.isFetching}
      />
      {!households.isPending && (
        <details
          className="fold create-household"
          open={none || creating}
          onToggle={(event) => {
            if (event.currentTarget.open) setCreating(true)
          }}
        >
          <summary className="btn-secondary">+ Tạo nhà mới</summary>
          <HouseholdCreateForm
            onCreate={create.mutateAsync}
            submitting={create.isPending}
            error={create.error?.message ?? null}
          />
        </details>
      )}
      <p className="hint">Ghi khoản chi lúc vừa trả. Cuối tháng app tự tính ai trả ai, ít lần chuyển nhất.</p>
    </>
  )
}

export default HouseholdsPage
