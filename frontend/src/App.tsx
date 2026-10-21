import { Link, Route, Routes } from 'react-router'

import { ToastProvider } from './components/Toast'

import DashboardPage from './pages/DashboardPage'
import ExpensesPage from './pages/ExpensesPage'
import HouseholdLayout from './pages/HouseholdLayout'
import HouseholdsPage from './pages/HouseholdsPage'
import MembersPage from './pages/MembersPage'
import NotFoundPage from './pages/NotFoundPage'

// The router and the query client are provided in main.tsx, so tests can supply their own
function App() {
  return (
    <ToastProvider>
      <header className="app-header">
        <Link to="/">Fair-Share</Link>
      </header>
      <main>
        <Routes>
          <Route index element={<HouseholdsPage />} />
          <Route path="households/:householdId" element={<HouseholdLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="expenses" element={<ExpensesPage />} />
            <Route path="members" element={<MembersPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </ToastProvider>
  )
}

export default App
