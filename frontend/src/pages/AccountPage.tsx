import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'

import { ApiError } from '../api/client'
import {
  changePassword,
  GENDER_NOTICE,
  getMyPhoto,
  keys,
  removePhoto,
  renameMe,
  setGender,
  setStatus,
  uploadPhoto,
} from '../api/households'
import { Avatar } from '../components/Avatar'
import ReceivingAccountForm from '../components/ReceivingAccountForm'
import type { Gender, MyHouseholds, RenameResult } from '../api/types'
import { useT } from '../i18n'
import { errorMessage } from '../lib/errors'
import { initialOf } from '../lib/names'
import { cropToSquare, PhotoPickError } from '../lib/photoCrop'
import { updateUser, useSession } from '../lib/session'

/**
 * The profile page (specs/010-profile-page): the email as it is, then one form per part, each saved
 * on its own so an error in one never loses what was typed in another (FR-004). Every rule is the
 * server's too; the checks here only answer sooner.
 */
function AccountPage() {
  const t = useT()
  const session = useSession()
  if (!session) return null
  return (
    <div className="profile">
      <h1>{t.profile.title}</h1>
      <p className="profile-email">
        <span className="hint">{t.profile.email}</span>
        <strong>{session.user.email}</strong>
        <span className="hint">{t.profile.emailHint}</span>
      </p>
      <PhotoForm name={session.user.display_name} userId={session.user.id} />
      <NameForm current={session.user.display_name} />
      <StatusForm current={session.user.status ?? ''} />
      <ReceivingAccountForm />
      <PasswordForm />
      <GenderForm current={session.user.gender ?? null} />
    </div>
  )
}

function NameForm({ current }: { current: string }) {
  const t = useT()
  const queryClient = useQueryClient()
  const [name, setName] = useState(current)
  const [problem, setProblem] = useState<string | null>(null)
  const [result, setResult] = useState<RenameResult | null>(null)
  const save = useMutation({
    mutationFn: () => renameMe(name.trim()),
    onSuccess: (renamed) => {
      setResult(renamed)
      setName(renamed.user.display_name)
      updateUser(renamed.user)
      // Every household this person is in shows the new name at its next look
      queryClient.invalidateQueries({ queryKey: keys.households })
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setProblem(t.profile.nameEmpty)
      return
    }
    if (trimmed.length > 40) {
      setProblem(t.profile.nameProblem)
      return
    }
    setProblem(null)
    setResult(null)
    save.mutate()
  }

  const failure = save.error instanceof ApiError && save.error.status === 422 ? t.profile.nameProblem : null
  const fieldProblem = problem ?? failure
  return (
    <section className="profile-part" aria-labelledby="profile-name-title">
      <h2 id="profile-name-title">{t.profile.nameTitle}</h2>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="profile-name">{t.profile.nameLabel}</label>
          <input
            id="profile-name"
            value={name}
            maxLength={80}
            autoComplete="name"
            aria-invalid={fieldProblem ? true : undefined}
            aria-describedby={fieldProblem ? 'profile-name-problem' : 'profile-name-hint'}
            onChange={(e) => {
              setName(e.target.value)
              setProblem(null)
              setResult(null)
              save.reset()
            }}
          />
          {fieldProblem ? (
            <p id="profile-name-problem" className="field-problem" role="alert">
              {fieldProblem}
            </p>
          ) : (
            <p id="profile-name-hint" className="hint">
              {t.profile.nameHint}
            </p>
          )}
        </div>
        {save.error && !failure && <p role="alert">{errorMessage(save.error)}</p>}
        <div className="profile-live" aria-live="polite">{result && <RenameNote result={result} />}</div>
        {/* Not disabled for the same name: saving it again brings a household the owner renamed
            back in line (FR-006) */}
        <button type="submit" disabled={save.isPending}>
          {save.isPending ? t.profile.saving : t.profile.save}
        </button>
      </form>
    </section>
  )
}

function RenameNote({ result }: { result: RenameResult }) {
  const t = useT()
  const queryClient = useQueryClient()
  if (result.kept.length === 0) {
    // In no household, only the account's name changed, and the note says so
    const mine = queryClient.getQueryData<MyHouseholds>(keys.households)
    const none = mine !== undefined && mine.households.length === 0
    return <p className="note ok">{none ? t.profile.renamedNoHouse : t.profile.renamedEverywhere}</p>
  }
  return (
    <div className="note">
      {result.kept.map((house) => (
        <p key={house.household_id}>
          {t.profile.kept(house.household_name, result.user.display_name, house.name)}
        </p>
      ))}
    </div>
  )
}

function PhotoForm({ name, userId }: { name: string; userId: number }) {
  const t = useT()
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const mine = useQuery({ queryKey: keys.myPhoto, queryFn: getMyPhoto })
  const [picked, setPicked] = useState<{ blob: Blob; url: string } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState<'set' | 'removed' | null>(null)
  // The preview's object URL is freed when it is replaced or the page closes
  useEffect(
    () => () => {
      if (picked) URL.revokeObjectURL(picked.url)
    },
    [picked],
  )

  const done = (what: 'set' | 'removed') => {
    setPicked(null)
    setSaved(what)
    queryClient.invalidateQueries({ queryKey: keys.myPhoto })
    // Every household shows the new photo at its next look (FR-032)
    queryClient.invalidateQueries({ queryKey: keys.households })
  }
  const save = useMutation({ mutationFn: (blob: Blob) => uploadPhoto(blob), onSuccess: () => done('set') })
  const remove = useMutation({ mutationFn: removePhoto, onSuccess: () => done('removed') })
  const busy = save.isPending || remove.isPending

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // the same file can be picked again after Huỷ
    if (!file) return
    setProblem(null)
    setSaved(null)
    save.reset()
    try {
      const blob = await cropToSquare(file)
      setPicked({ blob, url: URL.createObjectURL(blob) })
    } catch (error) {
      setProblem(error instanceof PhotoPickError && error.reason === 'too_big' ? t.profile.photoTooBig : t.profile.photoUnreadable)
    }
  }

  const look = {
    full: name,
    short: name,
    initial: initialOf(name),
    tint: (userId % 8) + 1,
    photo: picked?.url ?? mine.data?.data ?? undefined,
  }
  const failure = save.error ?? remove.error
  return (
    <section className="profile-part" aria-labelledby="profile-photo-title">
      <h2 id="profile-photo-title">{t.profile.photoTitle}</h2>
      <div className="profile-photo">
        <Avatar look={look} size="lg" />
        <div className="profile-buttons">
          {picked ? (
            <>
              <button type="button" disabled={busy} onClick={() => save.mutate(picked.blob)}>
                {save.isPending ? t.profile.saving : t.profile.save}
              </button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => setPicked(null)}>
                {t.common.cancel}
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => input.current?.click()}>
                {mine.data?.data ? t.profile.photoChange : t.profile.photoPick}
              </button>
              {mine.data?.data && (
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => remove.mutate()}>
                  {remove.isPending ? t.profile.saving : t.profile.photoRemove}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <input
        ref={input}
        id="profile-photo-file"
        // Opened by the Chọn ảnh button, which is the control people reach and read
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        aria-label={t.profile.photoPick}
        onChange={pick}
      />
      <p className="hint">{picked ? t.profile.photoPreview : t.profile.photoHint}</p>
      {(problem || failure) && (
        <p className="field-problem" role="alert">
          {problem ?? errorMessage(failure)}
        </p>
      )}
      <div className="profile-live" aria-live="polite">
        {saved && <p className="note ok">{saved === 'set' ? t.profile.photoSaved : t.profile.photoRemoved}</p>}
      </div>
    </section>
  )
}

/** Code points after NFC, as the server counts: an emoji is one, and "ế" typed as e + marks is one too. */
const length = (text: string) => [...text.normalize('NFC').trim()].length
const MAX_STATUS = 60

function StatusForm({ current }: { current: string }) {
  const t = useT()
  const queryClient = useQueryClient()
  const [status, setText] = useState(current)
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState<'set' | 'cleared' | null>(null)
  const save = useMutation({
    mutationFn: (next: string | null) => setStatus(next),
    onSuccess: (user) => {
      setText(user.status ?? '')
      setSaved(user.status ? 'set' : 'cleared')
      updateUser(user)
      queryClient.invalidateQueries({ queryKey: keys.households })
    },
  })

  function send(next: string) {
    if (length(next) > MAX_STATUS) {
      setProblem(t.profile.statusProblem)
      return
    }
    setProblem(null)
    setSaved(null)
    save.mutate(next.trim() ? next.trim() : null)
  }

  const fieldProblem = problem ?? (save.error instanceof ApiError && save.error.status === 422 ? t.profile.statusProblem : null)
  return (
    <section className="profile-part" aria-labelledby="profile-status-title">
      <h2 id="profile-status-title">{t.profile.statusTitle}</h2>
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          send(status)
        }}
        noValidate
      >
        <div className="field">
          <label htmlFor="profile-status">{t.profile.statusLabel}</label>
          <input
            id="profile-status"
            value={status}
            maxLength={200}
            placeholder={t.profile.statusPlaceholder}
            aria-invalid={fieldProblem ? true : undefined}
            aria-describedby={fieldProblem ? 'profile-status-problem' : 'profile-status-hint'}
            onChange={(e) => {
              setText(e.target.value)
              setProblem(null)
              setSaved(null)
              save.reset()
            }}
          />
          {fieldProblem ? (
            <p id="profile-status-problem" className="field-problem" role="alert">
              {fieldProblem}
            </p>
          ) : (
            <p id="profile-status-hint" className="hint">
              {t.profile.statusHint(length(status), MAX_STATUS)}
            </p>
          )}
        </div>
        {save.error && !fieldProblem && <p role="alert">{errorMessage(save.error)}</p>}
        <div className="profile-live" aria-live="polite">
          {saved && <p className="note ok">{saved === 'set' ? t.profile.statusSaved : t.profile.statusCleared}</p>}
        </div>
        <div className="profile-buttons">
          <button type="submit" disabled={save.isPending}>
            {save.isPending ? t.profile.saving : t.profile.save}
          </button>
          {current && (
            <button type="button" className="btn-secondary" disabled={save.isPending} onClick={() => send('')}>
              {t.profile.statusClear}
            </button>
          )}
        </div>
      </form>
    </section>
  )
}

const GENDERS: (Gender | null)[] = [null, 'male', 'female', 'other']

function GenderForm({ current }: { current: Gender | null }) {
  const t = useT()
  const queryClient = useQueryClient()
  const [choice, setChoice] = useState<Gender | null>(current)
  const [saved, setSaved] = useState(false)
  const save = useMutation({
    mutationFn: () => setGender(choice),
    onSuccess: (user) => {
      setChoice(user.gender ?? null)
      setSaved(true)
      updateUser(user)
      queryClient.invalidateQueries({ queryKey: keys.households })
    },
  })
  return (
    <section className="profile-part" aria-labelledby="profile-gender-title">
      <h2 id="profile-gender-title">{t.profile.genderTitle}</h2>
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          setSaved(false)
          save.mutate()
        }}
      >
        {/* The notice comes before the choice, so it is read before saving (FR-029) */}
        <p className="hint" id="profile-gender-notice" data-notice={GENDER_NOTICE}>
          {t.profile.genderNotice}
        </p>
        <fieldset className="profile-choices" aria-describedby="profile-gender-notice">
          <legend className="visually-hidden">{t.profile.genderTitle}</legend>
          {GENDERS.map((value) => (
            <label key={value ?? 'none'} className="profile-choice">
              <input
                type="radio"
                name="profile-gender"
                checked={choice === value}
                onChange={() => {
                  setChoice(value)
                  setSaved(false)
                  save.reset()
                }}
              />
              {value ? t.profile.genders[value] : t.profile.genderNone}
            </label>
          ))}
        </fieldset>
        {save.error && <p role="alert">{errorMessage(save.error)}</p>}
        <div className="profile-live" aria-live="polite">
          {saved && <p className="note ok">{choice ? t.profile.genderSaved : t.profile.genderCleared}</p>}
        </div>
        <button type="submit" disabled={save.isPending}>
          {save.isPending ? t.profile.saving : t.profile.save}
        </button>
      </form>
    </section>
  )
}

function PasswordForm() {
  const t = useT()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [problems, setProblems] = useState<{ current?: string; next?: string }>({})
  const [done, setDone] = useState(false)
  const save = useMutation({
    mutationFn: () => changePassword(current, next),
    // Passwords are never kept on the page after an answer (FR-036)
    onSettled: () => {
      setCurrent('')
      setNext('')
    },
    onSuccess: () => setDone(true),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    const found: typeof problems = {}
    if (!current) found.current = t.profile.currentProblem
    if (next.length < 8 || next.length > 128) found.next = t.profile.newProblem
    setProblems(found)
    setDone(false)
    if (Object.keys(found).length === 0) save.mutate()
  }

  const wrong = save.error instanceof ApiError && save.error.code === 'wrong_password'
  const currentProblem = problems.current ?? (wrong ? errorMessage(save.error) : null)
  return (
    <section className="profile-part" aria-labelledby="profile-password-title">
      <h2 id="profile-password-title">{t.profile.passwordTitle}</h2>
      <form onSubmit={submit} noValidate>
        {save.error && !wrong && <p role="alert">{errorMessage(save.error)}</p>}
        <div className="field">
          <label htmlFor="profile-current-password">{t.profile.currentPassword}</label>
          <input
            id="profile-current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            aria-invalid={currentProblem ? true : undefined}
            aria-describedby={currentProblem ? 'profile-current-problem' : undefined}
            onChange={(e) => setCurrent(e.target.value)}
          />
          {currentProblem && (
            <p id="profile-current-problem" className="field-problem" role="alert">
              {currentProblem}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="profile-new-password">{t.profile.newPassword}</label>
          <input
            id="profile-new-password"
            type="password"
            autoComplete="new-password"
            value={next}
            aria-invalid={problems.next ? true : undefined}
            aria-describedby={problems.next ? 'profile-new-problem' : 'profile-new-hint'}
            onChange={(e) => setNext(e.target.value)}
          />
          {problems.next ? (
            <p id="profile-new-problem" className="field-problem" role="alert">
              {problems.next}
            </p>
          ) : (
            <p id="profile-new-hint" className="hint">
              {t.profile.newPasswordHint}
            </p>
          )}
        </div>
        <div className="profile-live" aria-live="polite">{done && <p className="note ok">{t.profile.passwordChanged}</p>}</div>
        <button type="submit" disabled={save.isPending}>
          {save.isPending ? t.profile.saving : t.profile.changePassword}
        </button>
      </form>
    </section>
  )
}

export default AccountPage
