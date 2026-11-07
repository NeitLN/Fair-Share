import { useEffect } from 'react'
import { Link, Route, Routes } from 'react-router'

import AccountMenu from './components/AccountMenu'
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
  // The tab's title follows the language too
  useEffect(() => {
    document.title = t.pageTitle
  }, [t])

  // Signed out on a computer, the sign-in page carries the wordmark itself, in the middle of the screen
  // (specs/008-wider-desktop-signin), so the header would only repeat it in a corner
  const signInBlock = !session && wide

  return (
    <ToastProvider>
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
      <main className={signInBlock ? 'signed-out' : undefined}>
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
