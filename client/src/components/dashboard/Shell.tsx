import { Outlet, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { clearAuth } from '../../lib/auth'
import { useIsMobile } from '../../lib/useIsMobile'
import { computeTotals, computeTaxBreakdown } from '../../lib/portfolio'
import type { Holding } from '../../lib/portfolio'
import { simulateRetirement, retirementInputFromSettings } from '../../lib/retirement'
import Sidebar from './Sidebar'

// App chrome shared by all authenticated pages: sidebar + main content area.
export default function Shell() {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const holdingsQ = useQuery<{ holdings: Holding[] }>({
    queryKey: ['holdings'],
    queryFn: async () => (await api.get('/holdings')).data,
  })
  const settingsQ = useQuery<{ settings: Record<string, unknown> }>({
    queryKey: ['projection'],
    queryFn: async () => (await api.get('/projection')).data,
  })

  const holdings = holdingsQ.data?.holdings ?? []
  const netWorth = computeTotals(holdings).total

  // The FIRE goal defaults to the projected nest egg at retirement (from the
  // saved plan), or the user's explicit fireGoal override.
  const s = settingsQ.data?.settings
  const breakdown = computeTaxBreakdown(holdings)
  const preTaxPct = holdings.length ? breakdown.find((b) => b.treatment === 'PRE_TAX')?.pct ?? 0 : 0.5
  const rothPct = holdings.length ? breakdown.find((b) => b.treatment === 'ROTH')?.pct ?? 0 : 0.2
  const projectedGoal = s ? simulateRetirement(retirementInputFromSettings(s, netWorth, preTaxPct, rothPct)).balanceAtRetirement : 1_500_000
  const fireGoal = s && s.fireGoal != null ? Number(s.fireGoal) : projectedGoal

  async function setFireGoal(value: number | null) {
    await api.put('/projection', { fireGoal: value })
    qc.invalidateQueries({ queryKey: ['projection'] })
  }

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
      <Sidebar
        netWorth={netWorth}
        fireGoal={fireGoal}
        projectedGoal={projectedGoal}
        goalIsCustom={!!(s && s.fireGoal != null)}
        onSetGoal={setFireGoal}
        onLogout={logout}
      />
      <main style={{ flex: 1, minWidth: 0, padding: isMobile ? '16px 14px' : '30px 38px', display: 'flex', flexDirection: 'column', gap: isMobile ? 16 : 20 }}>
        <Outlet />
      </main>
    </div>
  )
}
