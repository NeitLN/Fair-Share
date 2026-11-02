import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { logout } from '../api/households'
import { closeFoldOnEscape } from '../lib/fold'
import { signOut, useSession } from '../lib/session'
import { useT } from '../i18n'
import LanguageSwitch from './LanguageSwitch'
import ThemeSwitch from './ThemeSwitch'

/**
 * The signed-in account in the header: its initial, opening to the name, the email, the language
 * and theme switches, and Sign out. Keeping the switches here leaves the header one line on a phone
 * (the wordmark and this button). Signing out ends the session on the server too (the token stops
 * working at once) and clears everything cached, so the next person on this device sees nothing of
 * the last one's groups.
 */
function AccountMenu() {
  const t = useT()
  const session = useSession()
  const queryClient = useQueryClient()
  const [leaving, setLeaving] = useState(false)
  if (!session) return null
  const { display_name: name, email } = session.user

  async function signOutHere() {
    setLeaving(true)
    try {
      await logout()
    } catch {
      // Offline or already ended: forgetting it here is what matters
    }
    queryClient.clear()
    signOut()
  }

  return (
    <details className="account-menu" onKeyDown={closeFoldOnEscape}>
      <summary aria-label={t.account.menu(name)}>
        <span className="account-initial" aria-hidden="true">
          {name.trim().split(/\s+/).pop()?.charAt(0).toUpperCase()}
        </span>
      </summary>
      <div className="account-panel">
        <p className="hint">{t.account.signedInAs}</p>
        <p>
          <strong>{name}</strong>
          <br />
          <small>{email}</small>
        </p>
        <div className="account-setting">
          <span className="hint" aria-hidden="true">
            {t.language.label}
          </span>
          <LanguageSwitch />
        </div>
        <div className="account-setting">
          <span className="hint" aria-hidden="true">
            {t.theme.label}
          </span>
          <ThemeSwitch />
        </div>
        <button type="button" className="btn-secondary" onClick={signOutHere} disabled={leaving}>
          {leaving ? t.account.signingOut : t.account.signOut}
        </button>
      </div>
    </details>
  )
}

export default AccountMenu
