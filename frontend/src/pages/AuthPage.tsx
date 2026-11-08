import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation } from 'react-router'

import { login, register } from '../api/households'
import type { Session } from '../api/types'
import { Avatar } from '../components/Avatar'
import LanguageSwitch from '../components/LanguageSwitch'
import ThemeSwitch from '../components/ThemeSwitch'
import { Wordmark } from '../components/Wordmark'
import { errorMessage } from '../lib/errors'
import type { MemberLook } from '../lib/names'
import { signIn } from '../lib/session'
import { useWide } from '../lib/useWide'
import { useT } from '../i18n'

type Mode = 'signIn' | 'register'

// Four stickers beside the form on a computer: decoration in the app's tints, not people
const SAMPLE_LOOKS: MemberLook[] = ['T', 'M', 'A', 'L'].map((initial, i) => ({
  full: '',
  short: initial,
  initial,
  tint: i + 1,
}))

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * Signing in or creating an account (docs/ACCOUNTS.md). Every page needs one, so this is what someone
 * signed out sees wherever they arrive; once signed in, the page they asked for opens (an invite link
 * included).
 */
function AuthPage() {
  const t = useT()
  const wide = useWide()
  // Someone opening a housemate's /join/CODE link is most likely new: they start on Tạo tài khoản and
  // are told why they are here
  const invited = useLocation().pathname.startsWith('/join/')
  const [mode, setMode] = useState<Mode>(invited ? 'register' : 'signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [name, setName] = useState('')
  const [problems, setProblems] = useState<Partial<Record<'email' | 'password' | 'name', string>>>({})

  const queryClient = useQueryClient()
  const send = useMutation({
    mutationFn: (): Promise<Session> =>
      mode === 'signIn' ? login(email.trim(), password) : register(email.trim(), password, name.trim()),
    // Whatever the last person on this device had loaded goes first: a session that expired (a 401)
    // signs out without clearing it, and the next account must never see another's groups
    onSuccess: (session) => {
      queryClient.clear()
      signIn(session)
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    const found: typeof problems = {}
    if (!EMAIL.test(email.trim())) found.email = t.auth.emailProblem
    if (mode === 'register') {
      if (password.length < 8 || password.length > 128) found.password = t.auth.passwordProblem
      if (name.trim().length === 0) found.name = t.auth.nameEmpty
      else if (name.trim().length > 40) found.name = t.auth.nameProblem
    } else if (!password) {
      found.password = t.auth.passwordProblem
    }
    setProblems(found)
    if (Object.keys(found).length === 0) send.mutate()
  }

  function switchTo(next: Mode) {
    setMode(next)
    setProblems({})
    send.reset()
  }

  const busy = send.isPending
  const problem = (field: keyof typeof problems) =>
    problems[field] && (
      <p id={`auth-${field}-problem`} className="field-problem" role="alert">
        {problems[field]}
      </p>
    )

  const card = (
    <section className="auth" aria-labelledby="auth-title">
      {/* The title says what this form does now: sign in, or create an account */}
      <h1 id="auth-title">
        {invited ? t.auth.invitedTitle : mode === 'register' ? t.auth.registerTitle : t.auth.title}
      </h1>
      {invited ? (
        <p className="note ok">{t.auth.invited}</p>
      ) : (
        // On a computer the intro sits beside the form instead, so it is read once
        !wide && <p className="hint">{t.auth.intro}</p>
      )}
      <div className="segmented auth-tabs" role="group" aria-label={t.auth.title}>
        {(['signIn', 'register'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => switchTo(value)}
          >
            {value === 'signIn' ? t.auth.signInTab : t.auth.registerTab}
          </button>
        ))}
      </div>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="auth-email">{t.auth.email}</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            maxLength={254}
            disabled={busy}
            aria-invalid={problems.email ? true : undefined}
            aria-describedby={problems.email ? 'auth-email-problem' : undefined}
            onChange={(event) => setEmail(event.target.value)}
          />
          {problem('email')}
        </div>
        {mode === 'register' && (
          <div className="field">
            <label htmlFor="auth-name">{t.auth.displayName}</label>
            <input
              id="auth-name"
              type="text"
              autoComplete="name"
              value={name}
              maxLength={40}
              disabled={busy}
              aria-invalid={problems.name ? true : undefined}
              aria-describedby={problems.name ? 'auth-name-problem' : 'auth-name-hint'}
              onChange={(event) => setName(event.target.value)}
            />
            {!problems.name && (
              <p id="auth-name-hint" className="hint">
                {t.auth.displayNameHint}
              </p>
            )}
            {problem('name')}
          </div>
        )}
        <div className="field">
          <label htmlFor="auth-password">{t.auth.password}</label>
          {/* Hiện / Ẩn inside the field, so a long password can be checked before it is sent */}
          <div className="password-field">
            <input
              id="auth-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              value={password}
              maxLength={128}
              disabled={busy}
              aria-invalid={problems.password ? true : undefined}
              aria-describedby={problems.password ? 'auth-password-problem' : 'auth-password-hint'}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="password-toggle"
              aria-controls="auth-password"
              aria-label={showPassword ? t.auth.hidePasswordLabel : t.auth.showPasswordLabel}
              onClick={() => setShowPassword((shown) => !shown)}
            >
              {showPassword ? t.auth.hidePassword : t.auth.showPassword}
            </button>
          </div>
          {mode === 'register' && !problems.password && (
            <p id="auth-password-hint" className="hint">
              {t.auth.passwordHint} {t.auth.noReset}
            </p>
          )}
          {problem('password')}
        </div>
        {send.error && <p role="alert">{errorMessage(send.error)}</p>}
        <button type="submit" className="btn-primary" disabled={busy}>
          {mode === 'signIn'
            ? busy
              ? t.auth.signingIn
              : t.auth.signIn
            : busy
              ? t.auth.registering
              : t.auth.register}
        </button>
      </form>
    </section>
  )
  const switches = (
    <footer className="app-footer">
      <LanguageSwitch />
      <ThemeSwitch />
    </footer>
  )
  if (!wide) {
    return (
      <>
        {card}
        {switches}
      </>
    )
  }
  // On a computer one block in the middle of the screen: the brand on the left, the form and its
  // switches on the right (specs/008-wider-desktop-signin). The left side holds no control, so the
  // keyboard goes form, language, theme, as seen.
  return (
    <div className="auth-layout">
      <div className="auth-intro">
        <Wordmark className="wordmark" />
        <p className="tagline">{t.tagline}</p>
        <p className="lead">{t.auth.intro}</p>
        {/* The stickers stand for the housemates; the line says so */}
        <div className="auth-people">
          <span className="avatar-stack" aria-hidden="true">
            {SAMPLE_LOOKS.map((look) => (
              <Avatar key={look.initial} look={look} size="lg" decorative />
            ))}
          </span>
          <p>{t.auth.people}</p>
        </div>
      </div>
      <div className="auth-form-column">
        {card}
        {switches}
      </div>
    </div>
  )
}

export default AuthPage
