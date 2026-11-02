import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { logout } from '../api/households'
import { closeFoldOnEscape } from '../lib/fold'
import { signOut, useSession } from '../lib/session'
import { useT } from '../i18n'

/**
 * The signed-in account in the header: its initial, opening to the name, the email and Sign out.
 * Signing out ends the session on the server too (the token stops working at once) and clears
 * everything cached, so the next person on this device sees nothing of the last one's groups.
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
        <button type="button" className="btn-secondary" onClick={signOutHere} disabled={leaving}>
          {leaving ? t.account.signingOut : t.account.signOut}
        </button>
      </div>
    </details>
  )
}

export default AccountMenu
