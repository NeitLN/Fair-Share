import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router'

import { ApiError } from '../api/client'
import {
  changePassword,
  GENDER_NOTICE,
  getMe,
  getMyPhoto,
  getReceivingAccount,
  keys,
  removePhoto,
  renameMe,
  setGender,
  setStatus,
  uploadPhoto,
} from '../api/households'
import { Avatar } from '../components/Avatar'
import InlineConfirm from '../components/InlineConfirm'
import PasswordInput from '../components/PasswordInput'
import ReceivingAccountForm from '../components/ReceivingAccountForm'
import type { Gender, MyHouseholds, RenameResult, User } from '../api/types'
import { useT } from '../i18n'
import { errorMessage } from '../lib/errors'
import { initialOf } from '../lib/names'
import { cropToSquare, PhotoPickError } from '../lib/photoCrop'
import { currentSession, updateUser, useSession } from '../lib/session'
import { useToast } from '../lib/toast'
import { hasUnsaved, useLeaveGuard, useUnsaved } from '../lib/unsaved'
import { usePageTitle } from '../lib/usePageTitle'

/** The photo a data URL holds ("data:image/jpeg;base64,…"), to save it again after Gỡ ảnh. */
function dataUrlToBlob(url: string): Blob {
  const [head, body] = url.split(',', 2)
  const type = /^data:([^;,]+)/.exec(head)?.[1] ?? 'image/jpeg'
  const bytes = Uint8Array.from(atob(body), (ch) => ch.charCodeAt(0))
  return new Blob([bytes], { type })
}

/**
 * The profile page (specs/010-profile-page, laid out by specs/017): a way back to the houses, then on a
 * computer a card on the left with how housemates see you and the parts on the right, one under the
 * other on a phone, in the same order either way. Each part is its own form, saved on its own, so an
 * error in one never loses what was typed in another (FR-004). Every rule is the server's too; the
 * checks here only answer sooner.
 */
function AccountPage() {
  const t = useT()
  const session = useSession()
  usePageTitle(t.profile.title, t.pageTitle)
  // Arriving from the account menu: the keyboard starts at the page's title, not nowhere (FR-025)
  const title = useRef<HTMLHeadingElement>(null)
  const arrived = useLocation().state as { focus?: string } | null
  useEffect(() => {
    if (arrived?.focus === 'title') title.current?.focus()
  }, [arrived])
  // Another phone may have changed the name, status or gender since this one signed in: read the account
  // again first, so no part starts from an old value and saves it back (review 12/11, F05). If the read
  // fails, the parts start from what this browser has
  // The parts start from what they are given; when the account read differs, they start again from it,
  // unless something is already typed there (it is never thrown away)
  const fresh = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const user = await getMe()
      const before = currentSession()?.user
      const changed =
        !before ||
        before.display_name !== user.display_name ||
        (before.status ?? '') !== (user.status ?? '') ||
        (before.gender ?? null) !== (user.gender ?? null)
      updateUser(user)
      return { restart: changed && !hasUnsaved() }
    },
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
  const round = fresh.data?.restart ? `fresh-${fresh.dataUpdatedAt}` : 'local'
  // Leaving with "Chưa lưu" anywhere on the page asks first (F09)
  useLeaveGuard(t.profile.leaveUnsaved)
  if (!session) return null
  const { user } = session
  return (
    <div className="profile">
      <div className="profile-head">
        <Link to="/" className="crumb-back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          {t.households.title}
        </Link>
        <h1 ref={title} tabIndex={-1}>
          {t.profile.title}
        </h1>
      </div>
      <div className="profile-layout">
        <IdentityCard user={user} />
        <div className="profile-parts">
          <NameForm key={`name-${round}`} current={user.display_name} />
          <StatusForm key={`status-${round}`} current={user.status ?? ''} />
          <ReceivingAccountForm />
          <PasswordForm />
          <GenderForm key={`gender-${round}`} current={user.gender ?? null} />
        </div>
      </div>
    </div>
  )
}

/** Compared as the server stores it: NFC, trimmed. A keyboard that sends accents as separate marks
 * gets the composed text back, and the two must count as equal (review of #276). */
const nfc = (text: string) => text.normalize('NFC').trim()

/** "Chưa lưu" beside a part's button while what is typed there is not saved (specs/017, FR-017). The
 * button itself is quiet (secondary) until then and filled while it shows, so the page has one loud
 * button at most, where the change is (review of #279). */
function Unsaved({ id, show }: { id: string; show: boolean }) {
  const t = useT()
  return show ? (
    <span id={id} className="unsaved">
      {t.profile.unsaved}
    </span>
  ) : null
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
      // The field takes what the server kept, so "Chưa lưu" goes away
      setName(renamed.user.display_name)
      updateUser(renamed.user)
      // Every household this person is in shows the new name at its next look
      queryClient.invalidateQueries({ queryKey: keys.households })
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (save.isPending) return
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
  const dirty = nfc(name) !== nfc(current)
  useUnsaved('name', dirty)
  return (
    <section className="profile-part" aria-labelledby="profile-name-title">
      <h2 id="profile-name-title">{t.profile.nameTitle}</h2>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="profile-name">{t.profile.nameLabel}</label>
          <div className="field-inline">
            <input
              id="profile-name"
              value={name}
              maxLength={80}
              autoComplete="name"
              aria-invalid={fieldProblem ? true : undefined}
              aria-describedby={fieldProblem ? 'profile-name-hint profile-name-problem' : 'profile-name-hint'}
              onChange={(e) => {
                setName(e.target.value)
                setProblem(null)
                setResult(null)
                save.reset()
              }}
            />
            <span className="profile-actions">
              {/* Never disabled: saving the same name again brings a household the owner renamed back in
                  line (FR-006). While it saves it says so and ignores presses, keeping the focus */}
              <button
                type="submit"
                className={dirty ? undefined : 'btn-secondary'}
                aria-disabled={save.isPending || undefined}
                aria-describedby={dirty ? 'profile-name-unsaved' : undefined}
              >
                {save.isPending ? t.profile.saving : t.profile.saveName}
              </button>
              <Unsaved id="profile-name-unsaved" show={dirty} />
            </span>
          </div>
          <p id="profile-name-hint" className="hint">
            {t.profile.nameHint}
          </p>
          {fieldProblem && (
            <p id="profile-name-problem" className="field-problem" role="alert">
              {fieldProblem}
            </p>
          )}
        </div>
        {save.error && !failure && <p role="alert">{errorMessage(save.error)}</p>}
        <div className="profile-live" aria-live="polite">{result && <RenameNote result={result} />}</div>
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

/**
 * How housemates see you (specs/017, US3): your avatar, name, status and receiving account as the
 * others see them, saved values only, then your email and the photo controls. Picking a photo saves
 * nothing: only Lưu ảnh does, and it is the card's one filled button (FR-018).
 */
function IdentityCard({ user }: { user: User }) {
  const t = useT()
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const pickButton = useRef<HTMLButtonElement>(null)
  const saveButton = useRef<HTMLButtonElement>(null)
  // The photo controls replace each other; the focus moves to the one that appears (FR-022)
  const [focusNext, setFocusNext] = useState<'pick' | 'save' | null>(null)
  useEffect(() => {
    if (!focusNext) return
    ;(focusNext === 'save' ? saveButton : pickButton).current?.focus()
    setFocusNext(null)
  }, [focusNext])
  const mine = useQuery({ queryKey: keys.myPhoto, queryFn: getMyPhoto })
  // The same answer as the Tài khoản nhận tiền part; never kept once the page is gone (spec 016, FR-021)
  const receiving = useQuery({ queryKey: keys.receivingAccount, queryFn: getReceivingAccount, gcTime: 0, staleTime: 0 })
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

  // `said`: the line under the photo; a removal is said by its toast instead, which offers Hoàn tác
  const done = (said: 'set' | 'removed' | null) => {
    setPicked(null)
    setSaved(said)
    setFocusNext('pick')
    queryClient.invalidateQueries({ queryKey: keys.myPhoto })
    // Every household shows the new photo at its next look (FR-032)
    queryClient.invalidateQueries({ queryKey: keys.households })
  }
  const toast = useToast()
  const save = useMutation({ mutationFn: (blob: Blob) => uploadPhoto(blob), onSuccess: () => done('set') })
  // Gỡ ảnh, asked first; the photo that was there is kept for Hoàn tác, which saves it again (review
  // 12/11, F12). It counts as an upload, like any other
  const remove = useMutation({
    mutationFn: (_before: string | null) => removePhoto(),
    onSuccess: (_result, before) => {
      done(null)
      toast({
        kind: 'success',
        text: t.profile.photoRemoved,
        action: before ? { label: t.common.undo, onAction: () => save.mutate(dataUrlToBlob(before)) } : undefined,
      })
    },
  })
  const busy = save.isPending || remove.isPending
  // A picked photo is not saved until Lưu ảnh
  useUnsaved('photo', picked !== null)

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
      setFocusNext('save')
    } catch (error) {
      setProblem(error instanceof PhotoPickError && error.reason === 'too_big' ? t.profile.photoTooBig : t.profile.photoUnreadable)
    }
  }

  const name = user.display_name
  const look = {
    full: name,
    short: name,
    initial: initialOf(name),
    tint: (user.id % 8) + 1,
    photo: picked?.url ?? mine.data?.data ?? undefined,
  }
  const account = receiving.data?.account
  const hint =
    account && account.supported && account.bank_name
      ? t.members.receivingHint(account.bank_name, account.account_number.slice(-4))
      : null
  const failure = save.error ?? remove.error
  return (
    <section className="profile-card" aria-labelledby="profile-card-title">
      <div className="profile-band" aria-hidden="true" />
      <div className="profile-card-body">
        <div className="profile-photo">
          <Avatar look={look} size="lg" />
        </div>
        <h2 id="profile-card-title" className="profile-card-title">
          {t.profile.cardTitle}
        </h2>
        <p className="profile-who">
          <strong className="profile-card-name">{name}</strong>
          <span className={user.status ? undefined : 'hint'}>{user.status || t.profile.noStatus}</span>
          {hint && <span className="profile-card-receiving">{hint}</span>}
        </p>
        <p className="profile-email">
          <span className="hint">{t.profile.email}</span>
          <strong>{user.email}</strong>
          <span className="hint">{t.profile.emailHint}</span>
        </p>
        <div className="profile-buttons">
          {picked ? (
            <>
              <button
                ref={saveButton}
                type="button"
                aria-disabled={busy || undefined}
                aria-describedby="profile-photo-unsaved"
                onClick={() => {
                  if (!busy) save.mutate(picked.blob)
                }}
              >
                {save.isPending ? t.profile.saving : t.profile.savePhoto}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => {
                  setPicked(null)
                  setFocusNext('pick')
                }}
              >
                {t.common.cancel}
              </button>
              <Unsaved id="profile-photo-unsaved" show />
            </>
          ) : (
            <>
              <button
                ref={pickButton}
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                {mine.data?.data ? t.profile.photoChange : t.profile.photoPick}
              </button>
              {mine.data?.data && (
                <InlineConfirm
                  label={t.profile.photoRemove}
                  question={t.profile.photoRemoveConfirm}
                  confirmLabel={t.profile.photoRemove}
                  onConfirm={() => remove.mutate(mine.data?.data ?? null)}
                  disabled={busy}
                  busy={remove.isPending}
                  busyLabel={t.profile.saving}
                />
              )}
            </>
          )}
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
  const field = useRef<HTMLInputElement>(null)
  const [status, setText] = useState(current)
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState<'set' | 'cleared' | null>(null)
  // Xoá trạng thái goes once it has done its job; the keyboard then goes to the field (FR-022)
  const [focusField, setFocusField] = useState(false)
  useEffect(() => {
    if (!focusField) return
    field.current?.focus()
    setFocusField(false)
  }, [focusField])
  const save = useMutation({
    mutationFn: (next: string | null) => setStatus(next),
    onSuccess: (user, next) => {
      // The field takes what the server kept, so "Chưa lưu" goes away
      setText(user.status ?? '')
      setSaved(user.status ? 'set' : 'cleared')
      updateUser(user)
      queryClient.invalidateQueries({ queryKey: keys.households })
      if (next === null) setFocusField(true)
    },
  })

  function send(next: string) {
    if (save.isPending) return
    if (length(next) > MAX_STATUS) {
      setProblem(t.profile.statusProblem)
      return
    }
    setProblem(null)
    setSaved(null)
    save.mutate(next.trim() ? next.trim() : null)
  }

  const fieldProblem = problem ?? (save.error instanceof ApiError && save.error.status === 422 ? t.profile.statusProblem : null)
  const dirty = nfc(status) !== nfc(current)
  useUnsaved('status', dirty)
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
          <div className="field-inline">
            <input
              ref={field}
              id="profile-status"
              value={status}
              maxLength={200}
              placeholder={t.profile.statusPlaceholder}
              aria-invalid={fieldProblem ? true : undefined}
              aria-describedby={fieldProblem ? 'profile-status-hint profile-status-problem' : 'profile-status-hint'}
              onChange={(e) => {
                setText(e.target.value)
                setProblem(null)
                setSaved(null)
                save.reset()
              }}
            />
            <span className="profile-actions">
              <button
                type="submit"
                className={dirty ? undefined : 'btn-secondary'}
                aria-disabled={save.isPending || undefined}
                aria-describedby={dirty ? 'profile-status-unsaved' : undefined}
              >
                {save.isPending ? t.profile.saving : t.profile.saveStatus}
              </button>
              <Unsaved id="profile-status-unsaved" show={dirty} />
              {/* On the save's line, not a row of its own: the part stays short (TODO 1, SC-002) */}
              {current && (
                <button type="button" className="btn-ghost" disabled={save.isPending} onClick={() => send('')}>
                  {t.profile.statusClear}
                </button>
              )}
            </span>
          </div>
          {/* The counter stays when there is a problem: the problem comes under it (FR-021) */}
          <p id="profile-status-hint" className="hint">
            {t.profile.statusHint(length(status), MAX_STATUS)}
          </p>
          {fieldProblem && (
            <p id="profile-status-problem" className="field-problem" role="alert">
              {fieldProblem}
            </p>
          )}
        </div>
        {save.error && !fieldProblem && <p role="alert">{errorMessage(save.error)}</p>}
        <div className="profile-live" aria-live="polite">
          {saved && <p className="note ok">{saved === 'set' ? t.profile.statusSaved : t.profile.statusCleared}</p>}
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
  const dirty = choice !== current
  useUnsaved('gender', dirty)
  return (
    <section className="profile-part" aria-labelledby="profile-gender-title">
      <h2 id="profile-gender-title">{t.profile.genderTitle}</h2>
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          if (save.isPending) return
          setSaved(false)
          save.mutate()
        }}
      >
        {/* The notice comes before the choice, so it is read before saving (FR-029) */}
        <p className="hint" id="profile-gender-notice" data-notice={GENDER_NOTICE}>
          {t.profile.genderNotice}
        </p>
        {/* Real radios in a group, drawn as pills; the radio itself stays visible as the mark (FR-020) */}
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
        <span className="profile-actions">
          <button
            type="submit"
            className={dirty ? undefined : 'btn-secondary'}
            aria-disabled={save.isPending || undefined}
            aria-describedby={dirty ? 'profile-gender-unsaved' : undefined}
          >
            {save.isPending ? t.profile.saving : t.profile.saveGender}
          </button>
          <Unsaved id="profile-gender-unsaved" show={dirty} />
        </span>
      </form>
    </section>
  )
}

function PasswordForm() {
  const t = useT()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  // Typed twice: there is no reset by email, so a typo here would lock the account (review 12/11, F06)
  const [again, setAgain] = useState('')
  const [problems, setProblems] = useState<{ current?: string; next?: string; again?: string }>({})
  const [done, setDone] = useState(false)
  const save = useMutation({
    mutationFn: () => changePassword(current, next),
    // Passwords are never kept on the page after an answer (FR-036)
    onSettled: () => {
      setCurrent('')
      setNext('')
      setAgain('')
    },
    onSuccess: () => setDone(true),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (save.isPending) return
    const found: typeof problems = {}
    if (!current) found.current = t.profile.currentProblem
    if (next.length < 8 || next.length > 128) found.next = t.profile.newProblem
    else if (again !== next) found.again = t.profile.againProblem
    setProblems(found)
    setDone(false)
    if (Object.keys(found).length === 0) save.mutate()
  }

  const wrong = save.error instanceof ApiError && save.error.code === 'wrong_password'
  const currentProblem = problems.current ?? (wrong ? errorMessage(save.error) : null)
  const dirty = current !== '' || next !== '' || again !== ''
  useUnsaved('password', dirty)
  return (
    <section className="profile-part" aria-labelledby="profile-password-title">
      <h2 id="profile-password-title">{t.profile.passwordTitle}</h2>
      <form onSubmit={submit} noValidate>
        {save.error && !wrong && <p role="alert">{errorMessage(save.error)}</p>}
        {/* Side by side when there is room (specs/017, US3) */}
        <div className="profile-pair">
          <div className="field">
            <label htmlFor="profile-current-password">{t.profile.currentPassword}</label>
            <PasswordInput
              id="profile-current-password"
              autoComplete="current-password"
              value={current}
              invalid={Boolean(currentProblem)}
              describedBy={currentProblem ? 'profile-current-problem' : undefined}
              onChange={setCurrent}
            />
            {currentProblem && (
              <p id="profile-current-problem" className="field-problem" role="alert">
                {currentProblem}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="profile-new-password">{t.profile.newPassword}</label>
            <PasswordInput
              id="profile-new-password"
              autoComplete="new-password"
              value={next}
              invalid={Boolean(problems.next)}
              describedBy={problems.next ? 'profile-new-hint profile-new-problem' : 'profile-new-hint'}
              onChange={setNext}
            />
            <p id="profile-new-hint" className="hint">
              {t.profile.newPasswordHint}
            </p>
            {problems.next && (
              <p id="profile-new-problem" className="field-problem" role="alert">
                {problems.next}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="profile-again-password">{t.profile.againPassword}</label>
            <PasswordInput
              id="profile-again-password"
              autoComplete="new-password"
              value={again}
              invalid={Boolean(problems.again)}
              describedBy={problems.again ? 'profile-again-problem' : undefined}
              onChange={setAgain}
            />
            {problems.again && (
              <p id="profile-again-problem" className="field-problem" role="alert">
                {problems.again}
              </p>
            )}
          </div>
        </div>
        <div className="profile-live" aria-live="polite">{done && <p className="note ok">{t.profile.passwordChanged}</p>}</div>
        <span className="profile-actions">
          <button
            type="submit"
            className={dirty ? undefined : 'btn-secondary'}
            aria-disabled={save.isPending || undefined}
            aria-describedby={dirty ? 'profile-password-unsaved' : undefined}
          >
            {save.isPending ? t.profile.saving : t.profile.changePassword}
          </button>
          <Unsaved id="profile-password-unsaved" show={dirty} />
        </span>
      </form>
    </section>
  )
}

export default AccountPage
