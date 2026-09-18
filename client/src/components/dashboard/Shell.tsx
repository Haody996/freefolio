import { Outlet, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { clearAuth } from '../../lib/auth'
import { useIsMobile } from '../../lib/useIsMobile'
import { investableTotal, bucketSplit } from '../../lib/portfolio'
import type { Holding, Liability } from '../../lib/portfolio'
import { simulateRetirement, retirementInputFromSettings, debtScheduleFromSettings } from '../../lib/retirement'
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

  const liabilitiesQ = useQuery<{ liabilities: Liability[] }>({
    queryKey: ['liabilities'],
    queryFn: async () => (await api.get('/liabilities')).data,
  })

  // FIRE progress tracks investable assets (real estate & vehicles excluded);
  // debts enter the projection through their payments.
  const holdings = holdingsQ.data?.holdings ?? []
  const netWorth = investableTotal(holdings)

  // The FIRE goal defaults to the projected nest egg at retirement (from the
  // saved plan), or the user's explicit fireGoal override.
  const s = settingsQ.data?.settings
  const { preTaxPct, rothPct } = bucketSplit(holdings)
  const debts = debtScheduleFromSettings(liabilitiesQ.data?.liabilities ?? [], s)
  const projectedGoal = s ? simulateRetirement(retirementInputFromSettings(s, netWorth, preTaxPct, rothPct, debts)).balanceAtRetirement : 1_500_000
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
