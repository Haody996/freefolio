import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Wallet, LineChart, Flame, User, LogOut } from 'lucide-react'
import { clearAuth } from '../../lib/auth'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/portfolio', label: 'Portfolio', icon: LineChart },
  { to: '/retirement', label: 'Retirement', icon: Flame },
  { to: '/profile', label: 'Profile', icon: User },
]

export default function Layout() {
  const navigate = useNavigate()

  function logout() {
    clearAuth()
    navigate('/login')
  }

  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar */}
      <aside className="flex flex-col border-slate-200 bg-white md:h-screen md:w-60 md:border-r md:sticky md:top-0">
        <div className="flex items-center gap-2 px-5 py-4">
          <Flame className="h-6 w-6 text-emerald-600" />
          <span className="text-lg font-bold tracking-tight">freefolio</span>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:gap-0.5 md:overflow-visible md:px-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={logout}
          className="mt-auto mx-3 mb-4 hidden items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 md:mt-auto md:flex"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 px-4 py-6 md:px-10 md:py-8">
        <Outlet />
      </main>
    </div>
  )
}
