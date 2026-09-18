import LineChart, { ChartLegend } from '../dashboard/LineChart'
import { fmtCompact, fmtUSD } from '../../lib/portfolio'
import { payoffDate } from '../../lib/debts'
import type { runDebtScenario } from '../../lib/scenarios'

type Result = ReturnType<typeof runDebtScenario>

export default function DebtScenarioCard({ label, result }: { label: string; result: Result }) {
  const { current, scenario } = result
  const n = Math.max(current.balances.length, scenario.balances.length)
  const pad = (b: number[]) => [...b, ...Array(Math.max(0, n - b.length)).fill(0)]
  const now = new Date()
  const saved = current.totalInterest - scenario.totalInterest
  return (
    <div style={{ background: '#16181F', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: '#35A0FF' }}>DEBT PLAN</div>
      <div style={{ fontFamily: "'Space Grotesk'", fontSize: 16, fontWeight: 700, marginTop: 2 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, margin: '12px 0' }}>
        <Stat label="Debt-free" value={`${payoffDate(current.months)} → ${payoffDate(scenario.months)}`} />
        <Stat label="Total interest" value={`${fmtCompact(current.totalInterest)} → ${fmtCompact(scenario.totalInterest)}`} sub={saved > 1 ? `saves ${fmtUSD(saved)}` : undefined} />
        {scenario.lumpSum > 0 && <Stat label="Paid now" value={fmtUSD(scenario.lumpSum)} />}
      </div>
      <LineChart
        series={[
          { key: 'cur', label: 'Current plan', color: '#8A90A2', values: pad(current.balances), dashed: true },
          { key: 'scn', label, color: '#35A0FF', values: pad(scenario.balances), area: true },
        ]}
        labels={Array.from({ length: n }, (_, i) => new Date(now.getFullYear(), now.getMonth() + i, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }))}
        tickFormat={(i) => new Date(now.getFullYear(), now.getMonth() + i, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
        yFormat={fmtCompact}
        zeroBased
        height={180}
      />
      <ChartLegend items={[{ color: '#35A0FF', label: 'This plan' }, { color: '#8A90A2', label: 'Current plan', dashed: true }]} />
      {result.warnings.map((w) => (
        <div key={w} style={{ marginTop: 8, fontSize: 12, color: '#F2C879' }}>
          ⚠ {w}
        </div>
      ))}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, color: '#8A90A2', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: "'Space Grotesk'", fontSize: 15, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#22E38A' }}>{sub}</div>}
    </div>
  )
}
