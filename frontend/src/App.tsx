import { useEffect } from 'react'
import { Link, Route, Routes } from 'react-router'

import AccountMenu from './components/AccountMenu'
import LanguageSwitch from './components/LanguageSwitch'
import ThemeSwitch from './components/ThemeSwitch'
import { ToastProvider } from './components/Toast'
import { Wordmark } from './components/Wordmark'
import { useT } from './i18n'
import { useSession } from './lib/session'
import AuthPage from './pages/AuthPage'
import DashboardPage from './pages/DashboardPage'
import ExpensesPage from './pages/ExpensesPage'
import HouseholdLayout from './pages/HouseholdLayout'
import HouseholdsPage from './pages/HouseholdsPage'
import MembersPage from './pages/MembersPage'
import NotFoundPage from './pages/NotFoundPage'

// The router and the query client are provided in main.tsx, so tests can supply their own
function App() {
  const t = useT()
  const session = useSession()
  // The tab's title follows the language too
  useEffect(() => {
    document.title = t.pageTitle
  }, [t])

  return (
    <ToastProvider>
      <header className="app-header">
        <Link to="/" className="home-link">
          <Wordmark className="wordmark" />
        </Link>
        {/* Signed in, language and theme live in the account menu, so the header stays one line on a
            phone; signed out, they sit under the sign-in form */}
        <AccountMenu />
      </header>
      <main>
        {/* Every page needs an account (docs/ACCOUNTS.md). Signed out, any address shows the sign-in
            form; once signed in, the page that was asked for (an invite link included) opens. */}
        {session ? (
          <Routes>
            <Route index element={<HouseholdsPage />} />
            <Route path="join/:code?" element={<HouseholdsPage />} />
            <Route path="households/:householdId" element={<HouseholdLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="expenses" element={<ExpensesPage />} />
              <Route path="members" element={<MembersPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        ) : (
          <>
            <AuthPage />
            <footer className="app-footer">
              <LanguageSwitch />
              <ThemeSwitch />
            </footer>
          </>
        )}
      </main>
    </ToastProvider>
  )
}

export default App
