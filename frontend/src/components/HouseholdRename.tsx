import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { FormEvent } from 'react'

import { keys, renameHousehold } from '../api/households'
import { useT } from '../i18n'
import { errorMessage } from '../lib/errors'
import { useToast } from '../lib/toast'

interface HouseholdRenameProps {
  householdId: number
  name: string
}

/**
 * "Đổi tên nhà" on Thành viên, for the owner only (the API refuses anyone else with 403): a fold with the
 * name, 1 to 60 characters like a new house. Saved, the name changes in the header and in Nhà của bạn.
 */
function HouseholdRename({ householdId, name }: HouseholdRenameProps) {
  const t = useT()
  const toast = useToast()
  const queryClient = useQueryClient()
  const fold = useRef<HTMLDetailsElement>(null)
  const [value, setValue] = useState(name)
  const [problem, setProblem] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: (next: string) => renameHousehold(householdId, next),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.household(householdId), exact: true })
      void queryClient.invalidateQueries({ queryKey: keys.households, exact: true })
      if (fold.current) fold.current.open = false
      toast({ text: t.households.renamed })
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = value.trim()
    if (trimmed.length < 1 || trimmed.length > 60) {
      setProblem(t.households.nameProblem)
      return
    }
    setProblem(null)
    save.mutate(trimmed)
  }

  return (
    <details
      ref={fold}
      className="fold house-rename"
      onToggle={(event) => {
        // Opening starts from the current name, not from an earlier unsaved try
        if (event.currentTarget.open) {
          setValue(name)
          setProblem(null)
          save.reset()
        }
      }}
    >
      <summary>{t.households.rename}</summary>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="house-rename-name">{t.households.nameLabel}</label>
          <input
            id="house-rename-name"
            type="text"
            value={value}
            maxLength={60}
            disabled={save.isPending}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? 'house-rename-problem' : undefined}
            onChange={(event) => setValue(event.target.value)}
          />
          {problem && (
            <p id="house-rename-problem" className="field-problem" role="alert">
              {problem}
            </p>
          )}
        </div>
        {save.error && <p role="alert">{errorMessage(save.error)}</p>}
        <button type="submit" className="btn-primary" disabled={save.isPending}>
          {save.isPending ? t.common.saving : t.households.renameSave}
        </button>
      </form>
    </details>
  )
}

export default HouseholdRename
