import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

import { createHousehold, keys, listHouseholds } from '../api/households'
import HouseholdCreateForm from '../components/HouseholdCreateForm'
import HouseholdList from '../components/HouseholdList'

// US-01: list households and create one
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

  return (
    <>
      <h1>Các nhà</h1>
      <HouseholdCreateForm
        onCreate={create.mutateAsync}
        submitting={create.isPending}
        error={create.error?.message ?? null}
      />
      <HouseholdList
        households={households.data ?? []}
        loading={households.isPending}
        error={households.error?.message ?? null}
      />
    </>
  )
}

export default HouseholdsPage
