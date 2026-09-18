import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { isAuthenticated } from './lib/auth'
import Shell from './components/dashboard/Shell'
import Login from './pages/Login'
import Register from './pages/Register'
import Spinner from './components/ui/Spinner'
import ErrorBoundary from './components/ui/ErrorBoundary'
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Retirement = lazy(() => import('./pages/Retirement'))
const Admin = lazy(() => import('./pages/Admin'))
const Performance = lazy(() => import('./pages/Performance'))
const Debts = lazy(() => import('./pages/Debts'))
const Settings = lazy(() => import('./pages/Settings'))
const Assistant = lazy(() => import('./pages/Assistant'))
const Taxes = lazy(() => import('./pages/Taxes'))
const CalculatorsIndex = lazy(() => import('./pages/calculators/CalculatorsIndex'))
const FireCalculator = lazy(() => import('./pages/calculators/FireCalculator'))
const CoastFireCalculator = lazy(() => import('./pages/calculators/CoastFireCalculator'))
const CompoundInterestCalculator = lazy(() => import('./pages/calculators/CompoundInterestCalculator'))
const DebtPayoffCalculator = lazy(() => import('./pages/calculators/DebtPayoffCalculator'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

function PrivateRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary where="app">
        {/* Pages load on demand — public calculators don't pull in the whole app. */}
        <Suspense
          fallback={
            <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Spinner />
            </div>
          }
        >
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Public calculators — no sign-in */}
          <Route path="/calculators" element={<CalculatorsIndex />} />
          <Route path="/calculators/fire" element={<FireCalculator />} />
          <Route path="/calculators/coast-fire" element={<CoastFireCalculator />} />
          <Route path="/calculators/compound-interest" element={<CompoundInterestCalculator />} />
          <Route path="/calculators/debt-payoff" element={<DebtPayoffCalculator />} />

          <Route
            path="/"
            element={
              <PrivateRoute>
                <Shell />
              </PrivateRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="performance" element={<Performance />} />
            <Route path="debts" element={<Debts />} />
            <Route path="retirement" element={<Retirement />} />
            <Route path="settings" element={<Settings />} />
            <Route path="assistant" element={<Assistant />} />
            <Route path="taxes" element={<Taxes />} />
            <Route path="admin" element={<Admin />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
