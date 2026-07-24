import { Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../lib/api'
import { clearAuth } from '../../lib/auth'
import { useIsMobile } from '../../lib/useIsMobile'
import { computeTotals } from '../../lib/portfolio'
import type { Holding } from '../../lib/portfolio'
import Sidebar from './Sidebar'

// App chrome shared by all authenticated pages: sidebar + main content area.
export default function Shell() {
  const isMobile = useIsMobile()
  const navigate = useNavigate()

  // Holdings drive the sidebar's net worth / FIRE progress. Shared cache with
  // the pages, so this doesn't double-fetch.
  const holdingsQ = useQuery<{ holdings: Holding[] }>({
    queryKey: ['holdings'],
    queryFn: async () => (await api.get('/holdings')).data,
  })
  const netWorth = computeTotals(holdingsQ.data?.holdings ?? []).total

  function logout() {
    clearAuth()
    navigate('/login')
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        minHeight: '100vh',
        background: '#0E0F13',
        color: '#F2F4F8',
        fontFamily: "'Manrope', system-ui, sans-serif",
      }}
    >
      <Sidebar netWorth={netWorth} onLogout={logout} />
      <main style={{ flex: 1, minWidth: 0, padding: isMobile ? '16px 14px' : '30px 38px', display: 'flex', flexDirection: 'column', gap: isMobile ? 16 : 20 }}>
        <Outlet />
      </main>
    </div>
  )
}
