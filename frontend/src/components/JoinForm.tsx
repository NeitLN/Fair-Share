import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router'

import { join, keys } from '../api/households'
import { errorMessage } from '../lib/errors'
import { useToast } from '../lib/toast'
import { useT } from '../i18n'

const CODE_CHARS = /[^0-9a-z]/gi

/**
 * "Vào nhà bằng mã mời" (docs/ACCOUNTS.md, J1): the 8 characters the owner sent, typed or filled in
 * from a `/join/CODE` link. Joining waits for the owner, so the answer is usually "request sent"; a
 * member who uses the code again goes straight to the group.
 */
function JoinForm({
  initialCode = '',
  onRequested,
}: {
  initialCode?: string
  /** The request was sent and now waits for the owner. */
  onRequested?: () => void
}) {
  const t = useT()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [code, setCode] = useState(initialCode)
  const [problem, setProblem] = useState<string | null>(null)

  const send = useMutation({
    mutationFn: (typed: string) => join(typed),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: keys.households, exact: true })
      if (result.status === 'member' && result.household_id !== null) {
        toast({ text: t.join.already })
        navigate(`/households/${result.household_id}`)
      } else {
        setCode('')
        toast({ text: t.join.sent })
        onRequested?.()
      }
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (code.replace(CODE_CHARS, '').length !== 8) {
      setProblem(t.join.codeProblem)
      return
    }
    setProblem(null)
    send.mutate(code)
  }

  return (
    <form onSubmit={submit} noValidate className="join-form">
      <label htmlFor="join-code">{t.join.codeLabel}</label>
      <input
        id="join-code"
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder={t.join.codePlaceholder}
        value={code}
        maxLength={20}
        disabled={send.isPending}
        aria-invalid={problem ? true : undefined}
        aria-describedby="join-code-hint"
        onChange={(event) => setCode(event.target.value)}
      />
      <p id="join-code-hint" className="hint">
        {t.join.codeHint}
      </p>
      {problem && <p role="alert">{problem}</p>}
      {send.error && <p role="alert">{errorMessage(send.error)}</p>}
      <button type="submit" className="btn-primary" disabled={send.isPending}>
        {send.isPending ? t.join.submitting : t.join.submit}
      </button>
    </form>
  )
}

export default JoinForm
