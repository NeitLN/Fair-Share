import { useEffect, useLayoutEffect, useRef } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router'

import AccountMenu from './components/AccountMenu'
import SlowNotice from './components/SlowNotice'
import { ToastProvider } from './components/Toast'
import { Wordmark } from './components/Wordmark'
import { useT } from './i18n'
import { useSession } from './lib/session'
import { useWide } from './lib/useWide'
import AccountPage from './pages/AccountPage'
import AuthPage from './pages/AuthPage'
import DashboardPage from './pages/DashboardPage'
import ExpensesPage from './pages/ExpensesPage'
import HouseholdLayout from './pages/HouseholdLayout'
import HouseholdsPage from './pages/HouseholdsPage'
import MembersPage from './pages/MembersPage'
import NotFoundPage from './pages/NotFoundPage'
import ReportPage from './pages/ReportPage'

// The router and the query client are provided in main.tsx, so tests can supply their own
function App() {
  const t = useT()
  const session = useSession()
  const wide = useWide()
  // The tab's title follows the language too. A layout effect, so it runs before a page's own title
  // (usePageTitle, specs/017) and never covers it
  useLayoutEffect(() => {
    document.title = t.pageTitle
  }, [t])

  // After moving to another page, a focus left on nothing (the link pressed is gone) goes to the new page's
  // title, so the keyboard and a screen reader start there (review 12/11, E04). A focus a page placed itself,
  // or a tab that stays on screen, is left where it is
  const { pathname } = useLocation()
  const firstPage = useRef(true)
  useEffect(() => {
    if (firstPage.current) {
      firstPage.current = false
      return undefined
    }
    const frame = requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return
      const heading = document.querySelector<HTMLElement>('main h1')
      if (!heading) return
      if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
      heading.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [pathname])

  // Signed out on a computer, the sign-in page carries the wordmark itself, in the middle of the screen
  // (specs/008-wider-desktop-signin), so the header would only repeat it in a corner
  const signInBlock = !session && wide

  return (
    <ToastProvider>
      {/* The first thing the keyboard reaches: straight to the page, past the header (E04) */}
      <a className="skip-link" href="#main">
        {t.common.skipToContent}
      </a>
      {!signInBlock && (
        <header className="app-header">
          <Link to="/" className="home-link">
            <Wordmark className="wordmark" />
          </Link>
          {/* Signed in, language and theme live in the account menu, so the header stays one line on a
              phone; signed out, they sit under the sign-in form */}
          <AccountMenu />
        </header>
      )}
      {/* A sleeping server takes about 50 s to answer: said above every page, signed in or not */}
      <SlowNotice />
      <main id="main" tabIndex={-1} className={signInBlock ? 'signed-out' : undefined}>
        {/* Every page needs an account (docs/ACCOUNTS.md). Signed out, any address shows the sign-in
            form; once signed in, the page that was asked for (an invite link included) opens. */}
        {session ? (
          <Routes>
            <Route index element={<HouseholdsPage />} />
            <Route path="join/:code?" element={<HouseholdsPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="households/:householdId" element={<HouseholdLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="expenses" element={<ExpensesPage />} />
              <Route path="members" element={<MembersPage />} />
              <Route path="report/:month?" element={<ReportPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        ) : (
          // The sign-in form, with the language and theme under it
          <AuthPage />
        )}
      </main>
    </ToastProvider>
  )
}

export default App
