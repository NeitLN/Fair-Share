import { useState } from 'react'

import { useT } from '../i18n'

interface PasswordInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
  maxLength?: number
}

/**
 * A password field with Hiện / Ẩn inside it, so a long password can be checked before it is sent: the
 * app has no reset by email, so a typo in a new password can lock someone out (review 12/11, F06, E12).
 * Edge's own reveal eye is hidden in index.css, so there is one way to show it.
 */
function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  disabled = false,
  invalid = false,
  describedBy,
  maxLength = 128,
}: PasswordInputProps) {
  const t = useT()
  const [shown, setShown] = useState(false)
  return (
    <div className="password-field">
      <input
        id={id}
        type={shown ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        className="password-toggle"
        aria-controls={id}
        aria-label={shown ? t.auth.hidePasswordLabel : t.auth.showPasswordLabel}
        onClick={() => setShown((now) => !now)}
      >
        {shown ? t.auth.hidePassword : t.auth.showPassword}
      </button>
    </div>
  )
}

export default PasswordInput
