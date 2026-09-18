import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../lib/api'
import LineChart, { ChartLegend } from '../dashboard/LineChart'
import { fmtCompact } from '../../lib/portfolio'
import type { ScenarioResult, PlanSummary } from '../../lib/scenarios'

const tone = (d: number) => (Math.abs(d) < 0.05 ? '#8A90A2' : d > 0 ? '#22E38A' : '#FF5470')

function outcome(s: PlanSummary): string {
  return s.lasts ? `Lasts to ${s.endAge}` : `Runs out at ${s.depletedAge}`
}

// A what-if result: current plan vs. scenario, with the balance path by age.
export default function ScenarioCard({ result }: { result: ScenarioResult }) {
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const { current, scenario } = result
  const dOdds = (scenario.successRate - current.successRate) * 100

  // Align both paths on age.
  const ages = [...new Set([...current.ages, ...scenario.ages])].sort((a, b) => a - b)
  const at = (s: PlanSummary) => ages.map((a) => {
    const i = s.ages.indexOf(a)
    return i >= 0 ? s.balances[i] : null
  })

  async function save() {
    setSaved('saving')
    try {
      await api.post('/scenarios', { name: result.label, overrides: result.overrides })
      setSaved('saved')
    } catch {
      setSaved('error')
    }
  }

  return (
    <div style={{ background: '#16181F', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: '#9B7CFF' }}>SCENARIO</div>
          <div style={{ fontFamily: "'Space Grotesk'", fontSize: 16, fontWeight: 700, marginTop: 2 }}>{result.label}</div>
        </div>
        <button
          onClick={save}
          disabled={saved === 'saving' || saved === 'saved'}
          style={{ border: '1px solid rgba(34,227,138,0.35)', background: saved === 'saved' ? 'rgba(34,227,138,0.12)' : 'transparent', color: '#22E38A', borderRadius: 9, padding: '6px 11px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: saved === 'saved' ? 'default' : 'pointer' }}
        >
          {saved === 'saved' ? '✓ Saved' : saved === 'saving' ? 'Saving…' : saved === 'error' ? 'Retry save' : 'Save as scenario'}
        </button>
      </div>
      {result.changes.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0 4px' }}>
          {result.changes.map((c) => (
            <span key={c} style={{ fontSize: 11.5, color: '#C9CDD8', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '3px 7px' }}>
              {c}
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, margin: '12px 0' }}>
        <Compare label="Success odds" from={`${(current.successRate * 100).toFixed(0)}%`} to={`${(scenario.successRate * 100).toFixed(0)}%`} delta={`${dOdds >= 0 ? '+' : ''}${dOdds.toFixed(0)} pts`} color={tone(dOdds)} />
        <Compare label={`Nest egg at ${scenario.retirementAge}`} from={fmtCompact(current.nestEgg)} to={fmtCompact(scenario.nestEgg)} color={tone(scenario.nestEgg - current.nestEgg)} />
        <Compare label="Money" from={outcome(current)} to={outcome(scenario)} color={scenario.lasts ? '#22E38A' : '#FF5470'} />
      </div>
      <LineChart
        series={[
          { key: 'cur', label: 'Current plan', color: '#8A90A2', values: at(current), dashed: true },
          { key: 'scn', label: result.label, color: '#22E38A', values: at(scenario), area: true },
        ]}
        labels={ages.map((a) => `Age ${a}`)}
        tickFormat={(i) => String(ages[i] ?? '')}
        yFormat={fmtCompact}
        zeroBased
        height={200}
      />
      <ChartLegend items={[{ color: '#22E38A', label: 'This scenario' }, { color: '#8A90A2', label: 'Current plan', dashed: true }]} />
      {result.warnings.map((w) => (
        <div key={w} style={{ marginTop: 8, fontSize: 12, color: '#F2C879' }}>
          ⚠ {w}
        </div>
      ))}
      {saved === 'saved' && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#8A90A2' }}>
          Saved — compare it with your plan on the <Link to="/retirement#scenarios">Retirement</Link> page.
        </div>
      )}
    </div>
  )
}

function Compare({ label, from, to, delta, color }: { label: string; from: string; to: string; delta?: string; color: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, color: '#8A90A2', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 12, color: '#8A90A2', marginTop: 4 }}>
        {from} <span style={{ color: '#5B6172' }}>→</span>
      </div>
      <div style={{ fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700, color }}>
        {to} {delta && <span style={{ fontSize: 12, fontWeight: 600 }}>({delta})</span>}
      </div>
    </div>
  )
}
