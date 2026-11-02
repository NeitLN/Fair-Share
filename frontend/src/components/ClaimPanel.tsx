import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'

import { ApiError } from '../api/client'
import { claim, getClaim, keys } from '../api/households'
import { errorMessage } from '../lib/errors'
import { useSession } from '../lib/session'
import JoinForm from './JoinForm'
import { useT } from '../i18n'

const NEW = 'new'

/**
 * An invite link from before accounts (`/households/12#k=…`), opened while signed in (docs/ACCOUNTS.md,
 * L1). If nobody owns that household yet, the user picks their name in it and becomes its owner. If it
 * already has an owner, the key opens nothing: they need an invite code, which they can enter here.
 */
function ClaimPanel({ householdId, oldKey }: { householdId: number; oldKey: string }) {
  const t = useT()
  const session = useSession()
  const queryClient = useQueryClient()
  const [choice, setChoice] = useState(NEW)
  const info = useQuery({
    queryKey: ['claim', householdId, oldKey],
    queryFn: () => getClaim(householdId, oldKey),
    retry: false,
  })
  const take = useMutation({
    mutationFn: () => claim(householdId, oldKey, choice === NEW ? null : Number(choice)),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['claim', householdId] })
      return queryClient.invalidateQueries({ queryKey: keys.households })
    },
  })

  const owned = info.error instanceof ApiError && info.error.code === 'household_has_owner'
  if (owned) {
    return (
      <>
        <h1>{t.household.notFoundTitle}</h1>
        <p className="note attention">{t.claim.owned}</p>
        <JoinForm />
        <Link to="/" className="back-link">
          {t.common.backToHouseholds}
        </Link>
      </>
    )
  }
  if (info.error) {
    return (
      <>
        <h1>{t.household.notFoundTitle}</h1>
        <p>{t.household.notFound}</p>
        <Link to="/" className="back-link">
          {t.common.backToHouseholds}
        </Link>
      </>
    )
  }
  if (!info.data) return <p className="hint">{t.common.loading}</p>

  function submit(event: FormEvent) {
    event.preventDefault()
    take.mutate()
  }

  const myName = session?.user.display_name ?? ''
  return (
    <section aria-labelledby="claim-title">
      <h1 id="claim-title">{t.claim.title(info.data.name)}</h1>
      <p className="hint">{t.claim.intro}</p>
      <form onSubmit={submit}>
        <fieldset className="field">
          <legend>{t.claim.whoAreYou}</legend>
          {info.data.members.map((m) => (
            <label key={m.id} className="choice">
              <input
                type="radio"
                name="claim-member"
                value={m.id}
                checked={choice === String(m.id)}
                onChange={() => setChoice(String(m.id))}
              />{' '}
              {m.name}
            </label>
          ))}
          <label className="choice">
            <input
              type="radio"
              name="claim-member"
              value={NEW}
              checked={choice === NEW}
              onChange={() => setChoice(NEW)}
            />{' '}
            {t.claim.newName(myName)}
          </label>
        </fieldset>
        {take.error && <p role="alert">{errorMessage(take.error)}</p>}
        <button type="submit" className="btn-primary" disabled={take.isPending}>
          {take.isPending ? t.claim.submitting : t.claim.submit}
        </button>
      </form>
    </section>
  )
}

export default ClaimPanel
