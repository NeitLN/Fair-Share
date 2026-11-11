import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'

import { getMyPhoto, keys, logout } from '../api/households'
import { closeFoldOnEscape } from '../lib/fold'
import { initialOf } from '../lib/names'
import { signOut, useSession } from '../lib/session'
import { useT } from '../i18n'
import { Avatar } from './Avatar'
import LanguageSwitch from './LanguageSwitch'
import ThemeSwitch from './ThemeSwitch'

/**
 * The signed-in account in the header: its avatar, the same as on the profile (photo, or the initial on
 * the person's own tint; specs/017, US5), opening to the name, the email, the language
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
  const onProfile = useLocation().pathname === '/account'
  const menu = useRef<HTMLDetailsElement>(null)
  // It covers part of the page, so it closes like a menu: a tap outside, or the keyboard leaving it
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const outside = (event: Event) => {
      if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', outside)
    }
  }, [open])
  // The person's own photo, once per session; the profile invalidates it after a change, so the button
  // follows without a reload. Cleared with everything else on sign-out
  const photo = useQuery({ queryKey: keys.myPhoto, queryFn: getMyPhoto, staleTime: Infinity, enabled: !!session })
  if (!session) return null
  const { display_name: name, email } = session.user
  // The profile's colour (user id), not a house's member list, which picks colours per house (#276 review)
  const look = {
    full: name,
    short: name,
    initial: initialOf(name),
    tint: (session.user.id % 8) + 1,
    photo: photo.data?.data ?? undefined,
  }

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
    <details
      ref={menu}
      className="account-menu"
      onKeyDown={closeFoldOnEscape}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary aria-label={t.account.menu(name)}>
        <Avatar look={look} decorative />
      </summary>
      <div className="account-panel">
        <p className="hint">{t.account.signedInAs}</p>
        <p>
          <strong>{name}</strong>
          <br />
          <small>{email}</small>
        </p>
        {/* Closes the menu on the way, so it does not stay open over the profile page; the page then puts
            the keyboard on its title (specs/017, FR-025) */}
        <Link
          to="/account"
          state={{ focus: 'title' }}
          aria-current={onProfile ? 'page' : undefined}
          className="account-profile-link"
          onClick={() => {
            if (menu.current) menu.current.open = false
          }}
        >
          {t.account.profile}
        </Link>
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
