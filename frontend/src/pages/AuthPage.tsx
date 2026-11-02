import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'

import { login, register } from '../api/households'
import type { Session } from '../api/types'
import { errorMessage } from '../lib/errors'
import { signIn } from '../lib/session'
import { useT } from '../i18n'

type Mode = 'signIn' | 'register'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * Signing in or creating an account (docs/ACCOUNTS.md). Every page needs one, so this is what someone
 * signed out sees wherever they arrive; once signed in, the page they asked for opens (an invite link
 * included).
 */
function AuthPage() {
  const t = useT()
  const [mode, setMode] = useState<Mode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [problems, setProblems] = useState<Partial<Record<'email' | 'password' | 'name', string>>>({})

  const send = useMutation({
    mutationFn: (): Promise<Session> =>
      mode === 'signIn' ? login(email.trim(), password) : register(email.trim(), password, name.trim()),
    onSuccess: signIn,
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    const found: typeof problems = {}
    if (!EMAIL.test(email.trim())) found.email = t.auth.emailProblem
    if (mode === 'register') {
      if (password.length < 8 || password.length > 128) found.password = t.auth.passwordProblem
      if (name.trim().length < 1 || name.trim().length > 40) found.name = t.auth.nameProblem
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

  return (
    <section className="auth" aria-labelledby="auth-title">
      <h1 id="auth-title">{t.auth.title}</h1>
      <p className="hint">{t.auth.intro}</p>
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
            <p id="auth-name-hint" className="hint">
              {t.auth.displayNameHint}
            </p>
            {problem('name')}
          </div>
        )}
        <div className="field">
          <label htmlFor="auth-password">{t.auth.password}</label>
          <input
            id="auth-password"
            type="password"
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            value={password}
            maxLength={128}
            disabled={busy}
            aria-invalid={problems.password ? true : undefined}
            aria-describedby={problems.password ? 'auth-password-problem' : 'auth-password-hint'}
            onChange={(event) => setPassword(event.target.value)}
          />
          {mode === 'register' && (
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
}

export default AuthPage
