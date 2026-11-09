import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'

import { ApiError } from '../api/client'
import { deleteReceivingAccount, getReceivingAccount, keys, saveReceivingAccount } from '../api/households'
import banks from '../data/vietqr-banks.json'
import { useT } from '../i18n'
import { cleanAscii } from '../lib/cleanAscii'
import { errorMessage } from '../lib/errors'

// Only the banks that take VietQR account transfers can be chosen (FR-016); the server checks too
const CHOICES = banks.banks.filter((bank) => bank.transfer)

type Field = 'bank' | 'number' | 'holder'
const FIELD_OF: Record<string, Field> = {
  unknown_bank: 'bank',
  bad_account_number: 'number',
  bad_holder_name: 'holder',
}

/**
 * "Tài khoản nhận tiền" on Hồ sơ của bạn (specs/016-vietqr, US1): the bank account a housemate who owes
 * you pays into by VietQR. Who will see it is said before saving. The account is never kept once the
 * page is gone (FR-021); the server cleans what was typed and names each problem under its field.
 */
function ReceivingAccountForm() {
  const t = useT()
  const queryClient = useQueryClient()
  const account = useQuery({
    queryKey: keys.receivingAccount,
    queryFn: getReceivingAccount,
    gcTime: 0,
    staleTime: 0,
  })
  // Leaving the page drops the number from memory at once
  useEffect(() => () => queryClient.removeQueries({ queryKey: keys.receivingAccount }), [queryClient])

  const [editing, setEditing] = useState(false)
  const [bank, setBank] = useState('')
  const [number, setNumber] = useState('')
  const [holder, setHolder] = useState('')
  const [said, setSaid] = useState<'saved' | 'deleted' | null>(null)

  const save = useMutation({
    mutationFn: () => saveReceivingAccount({ bank_bin: bank, account_number: number, holder_name: holder }),
    onSuccess: (result) => {
      queryClient.setQueryData(keys.receivingAccount, result)
      setEditing(false)
      setSaid('saved')
    },
  })
  const remove = useMutation({
    mutationFn: deleteReceivingAccount,
    onSuccess: () => {
      queryClient.setQueryData(keys.receivingAccount, { account: null })
      setSaid('deleted')
    },
  })

  const problems: Record<Field, string> = {
    bank: t.profile.receivingUnknownBank,
    number: t.profile.receivingBadNumber,
    holder: t.profile.receivingBadHolder,
  }
  const failedField = save.error instanceof ApiError ? FIELD_OF[save.error.code] : undefined
  const saved = account.data?.account ?? null

  function startEditing() {
    setBank(saved?.bank_bin ?? '')
    setNumber(saved?.account_number ?? '')
    setHolder(saved?.holder_name ?? '')
    setSaid(null)
    save.reset()
    setEditing(true)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setSaid(null)
    save.mutate()
  }

  function field(id: Field, label: string, input: ReactNode, hint?: string) {
    const problem = failedField === id ? problems[id] : null
    return (
      <div className="field">
        <label htmlFor={`receiving-${id}`}>{label}</label>
        {input}
        {problem ? (
          <p id={`receiving-${id}-problem`} className="field-problem" role="alert">
            {problem}
          </p>
        ) : (
          hint && (
            <p id={`receiving-${id}-hint`} className="hint">
              {hint}
            </p>
          )
        )}
      </div>
    )
  }
  const describedBy = (id: Field) =>
    failedField === id ? `receiving-${id}-problem` : `receiving-${id}-hint`
  const invalid = (id: Field) => (failedField === id ? true : undefined)
  const preview = cleanAscii(holder)

  return (
    <section className="profile-part" aria-labelledby="profile-receiving-title">
      <h2 id="profile-receiving-title">{t.profile.receivingTitle}</h2>
      <p className="hint">{t.profile.receivingIntro}</p>
      {account.isError && <p role="alert">{errorMessage(account.error)}</p>}

      {editing ? (
        <form onSubmit={submit} noValidate>
          {field(
            'bank',
            t.profile.receivingBank,
            <select
              id="receiving-bank"
              value={bank}
              aria-invalid={invalid('bank')}
              aria-describedby={failedField === 'bank' ? 'receiving-bank-problem' : undefined}
              onChange={(e) => setBank(e.target.value)}
            >
              <option value="">{t.profile.receivingBankPick}</option>
              {CHOICES.map((choice) => (
                <option key={choice.bin} value={choice.bin}>
                  {choice.name}
                </option>
              ))}
            </select>,
          )}
          {field(
            'number',
            t.profile.receivingNumber,
            <input
              id="receiving-number"
              value={number}
              inputMode="numeric"
              autoComplete="off"
              maxLength={40}
              aria-invalid={invalid('number')}
              aria-describedby={describedBy('number')}
              onChange={(e) => setNumber(e.target.value)}
            />,
            t.profile.receivingNumberHint,
          )}
          {field(
            'holder',
            t.profile.receivingHolder,
            <input
              id="receiving-holder"
              value={holder}
              autoComplete="off"
              maxLength={80}
              aria-invalid={invalid('holder')}
              aria-describedby={describedBy('holder')}
              onChange={(e) => setHolder(e.target.value)}
            />,
            preview ? t.profile.receivingHolderPreview(preview) : undefined,
          )}
          <p className="note">{t.profile.receivingPrivacy}</p>
          {save.error && !failedField && <p role="alert">{errorMessage(save.error)}</p>}
          <div className="profile-buttons">
            <button type="submit" disabled={save.isPending}>
              {save.isPending ? t.profile.saving : t.profile.save}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
              {t.profile.receivingCancel}
            </button>
          </div>
        </form>
      ) : saved ? (
        <>
          <p className="receiving-saved">
            <strong>
              {[saved.bank_name ?? saved.bank_bin, saved.account_number, saved.holder_name].join(' · ')}
            </strong>
          </p>
          {!saved.supported && <p className="note">{t.profile.receivingUnsupported}</p>}
          <p className="hint">{t.profile.receivingAfterDelete}</p>
          {remove.error && <p role="alert">{errorMessage(remove.error)}</p>}
          <div className="profile-buttons">
            <button type="button" className="btn-secondary" onClick={startEditing}>
              {t.profile.receivingEdit}
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(t.profile.receivingDeleteAsk)) remove.mutate()
              }}
            >
              {t.profile.receivingDelete}
            </button>
          </div>
        </>
      ) : (
        account.isSuccess && (
          <>
            <p>{t.profile.receivingNone}</p>
            <button type="button" className="btn-secondary" onClick={startEditing}>
              {t.profile.receivingAdd}
            </button>
          </>
        )
      )}
      <div className="profile-live" aria-live="polite">
        {said && (
          <p className="note ok">{said === 'saved' ? t.profile.receivingSaved : t.profile.receivingDeleted}</p>
        )}
      </div>
    </section>
  )
}

export default ReceivingAccountForm
