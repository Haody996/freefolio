import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import api from '../../lib/api'
import { runScenario, planSettingsFor } from '../../lib/scenarios'
import type { PlanData, ScenarioOverrides } from '../../lib/scenarios'
import { fmtCompact } from '../../lib/portfolio'
import { panel } from '../ui/styles'

interface SavedScenario {
  id: string
  name: string
  overrides: ScenarioOverrides
  createdAt: string
}

const tone = (d: number) => (Math.abs(d) < 0.05 ? '#8A90A2' : d > 0 ? '#22E38A' : '#FF5470')

// Scenarios saved from the AI assistant, re-evaluated live against the plan.
export default function SavedScenarios({ data, planKey, onApply }: { data: PlanData; planKey: string; onApply: (patch: Record<string, unknown>) => void }) {
  const qc = useQueryClient()
  const location = useLocation()
  const [applied, setApplied] = useState<string | null>(null)
  const q = useQuery<{ scenarios: SavedScenario[] }>({ queryKey: ['scenarios'], queryFn: async () => (await api.get('/scenarios')).data })
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/scenarios/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scenarios'] }),
  })

  useEffect(() => {
    if (location.hash === '#scenarios' && q.data) document.getElementById('scenarios')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [location.hash, q.data])

  // Re-simulate only when the scenarios or the plan's inputs change (planKey),
  // not on every render of the Retirement page.
  const rows = useMemo(
    () => (q.data?.scenarios ?? []).map((s) => ({ s, result: runScenario(data, s.overrides, s.name), patch: planSettingsFor(data, s.overrides) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q.data, planKey]
  )
  const current = rows[0]?.result.current

  return (
    <section style={{ ...panel, scrollMarginTop: 20 }} id="scenarios">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700 }}>Saved scenarios</h2>
          <div style={{ fontSize: 13, color: '#8A90A2', marginTop: 3 }}>What-ifs you saved from Ask AI, recalculated against your current plan.</div>
        </div>
        <Link to="/assistant" style={{ fontSize: 13, fontWeight: 700 }}>
          Explore a what-if →
        </Link>
      </div>
      {q.isLoading ? null : rows.length === 0 ? (
        <div style={{ fontSize: 13.5, color: '#C9CDD8', lineHeight: 1.55 }}>
          Nothing saved yet. Ask something like “What if I retire at 52?” in <Link to="/assistant">Ask AI</Link> and hit “Save as scenario”.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {current && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline', padding: '8px 0', fontSize: 13, color: '#8A90A2' }}>
              <b style={{ color: '#C9CDD8' }}>Current plan</b>
              <span>{(current.successRate * 100).toFixed(0)}% odds</span>
              <span>{fmtCompact(current.nestEgg)} at {current.retirementAge}</span>
              <span>{current.lasts ? `lasts to ${current.endAge}` : `runs out at ${current.depletedAge}`}</span>
            </div>
          )}
          {rows.map(({ s, result, patch }) => {
            const d = (result.scenario.successRate - result.current.successRate) * 100
            return (
              <div key={s.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '6px 14px', padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{s.name}</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 5 }}>
                    {result.changes.map((c) => (
                      <span key={c} style={{ fontSize: 11.5, color: '#C9CDD8', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '2px 7px' }}>
                        {c}
                      </span>
                    ))}
                  </div>
                  {result.warnings.map((w) => (
                    <div key={w} style={{ fontSize: 12, color: '#F2C879', marginTop: 4 }}>
                      ⚠ {w}
                    </div>
                  ))}
                </div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  <div style={{ fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700, color: tone(d) }}>
                    {(result.scenario.successRate * 100).toFixed(0)}%{' '}
                    <span style={{ fontSize: 12 }}>
                      ({d >= 0 ? '+' : ''}
                      {d.toFixed(0)} pts)
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#8A90A2' }}>
                    {fmtCompact(result.scenario.nestEgg)} at {result.scenario.retirementAge} · {result.scenario.lasts ? `lasts to ${result.scenario.endAge}` : `runs out at ${result.scenario.depletedAge}`}
                  </div>
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    onClick={() => {
                      if (!patch) return
                      onApply(patch)
                      setApplied(s.id)
                    }}
                    disabled={!patch}
                    title={patch ? 'Update your plan with these changes' : 'Includes one-time events (a crash, a lump-sum payoff, a bond shift) that can’t be saved to your plan'}
                    style={{ border: '1px solid rgba(34,227,138,0.35)', background: 'transparent', color: patch ? '#22E38A' : '#5B6172', borderColor: patch ? 'rgba(34,227,138,0.35)' : 'rgba(255,255,255,0.08)', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: patch ? 'pointer' : 'not-allowed' }}
                  >
                    {applied === s.id ? '✓ Applied to plan' : 'Apply to my plan'}
                  </button>
                  <button
                    onClick={() => remove.mutate(s.id)}
                    style={{ border: 'none', background: 'transparent', color: '#8A90A2', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
