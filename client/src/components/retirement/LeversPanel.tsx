import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import api from '../../lib/api'
import LeversTable from '../assistant/LeversTable'
import { computeLevers } from '../../lib/scenarios'
import type { PlanData, LeversResult, Lever } from '../../lib/scenarios'
import { panel } from '../ui/styles'

// "What matters most": each lever re-simulated on the same markets as the
// plan, ranked by its effect on the success odds; AI summarizes the top three.
export default function LeversPanel({ data, planKey }: { data: PlanData; planKey: string }) {
  const [result, setResult] = useState<{ key: string; levers: LeversResult } | null>(null)
  const [busy, setBusy] = useState(false)
  const [ai, setAi] = useState<{ text?: string; error?: string; loading?: boolean }>({})
  const stale = result != null && result.key !== planKey

  function run() {
    setBusy(true)
    setAi({})
    // Let the button repaint before the simulations run.
    setTimeout(() => {
      setResult({ key: planKey, levers: computeLevers(data) })
      setBusy(false)
    }, 20)
  }

  async function explain() {
    if (!result) return
    setAi({ loading: true })
    const row = (l: Lever) => ({ lever: l.label, oddsBeforePct: +(result.levers.baseline.successRate * 100).toFixed(1), oddsAfterPct: +(l.summary.successRate * 100).toFixed(1), nestEggChange: Math.round(l.deltaNestEgg) })
    try {
      const { data: res } = await api.post('/assistant/explain-levers', {
        baseline: { successOddsPct: +(result.levers.baseline.successRate * 100).toFixed(1), retirementAge: result.levers.baseline.retirementAge, planEndAge: result.levers.baseline.endAge, nestEgg: Math.round(result.levers.baseline.nestEgg) },
        improvements: result.levers.improvements.map(row),
        littleOrNoHelp: result.levers.noHelp.map(row),
        risks: result.levers.risks.map(row),
      })
      setAi({ text: res.text })
    } catch (err: any) {
      setAi({ error: err?.response?.data?.error || 'The AI summary is unavailable right now.' })
    }
  }

  return (
    <section style={panel} id="levers">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700 }}>What matters most</h2>
          <div style={{ fontSize: 13, color: '#8A90A2', marginTop: 3 }}>Each change re-run on the same simulated markets as your plan, so the differences are real.</div>
        </div>
        <button onClick={run} disabled={busy} style={{ border: 'none', background: '#22E38A', color: '#04140C', borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: busy ? 'default' : 'pointer' }}>
          {busy ? 'Simulating…' : result ? (stale ? 'Re-run for current plan' : 'Re-run') : 'Rank my levers'}
        </button>
      </div>
      {stale && <div style={{ fontSize: 12.5, color: '#F2C879', marginBottom: 10 }}>Your plan changed since this ran — re-run to update.</div>}
      {result ? (
        <>
          <div style={{ borderRadius: 14, padding: '14px 16px', marginBottom: 16, background: 'linear-gradient(135deg, rgba(34,227,138,0.08), rgba(155,124,255,0.08))', border: '1px solid rgba(155,124,255,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 }}>
                <Sparkles size={15} color="#9B7CFF" /> In plain English
              </span>
              {!ai.text && (
                <button onClick={explain} disabled={ai.loading} style={{ border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.06)', color: '#F2F4F8', borderRadius: 9, padding: '6px 11px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
                  {ai.loading ? 'Explaining…' : 'Explain with AI'}
                </button>
              )}
            </div>
            {ai.text && <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.6, color: '#E7EAF1' }}>{ai.text}</p>}
            {ai.error && <p style={{ margin: '10px 0 0', fontSize: 13, color: '#8A90A2' }}>{ai.error}</p>}
          </div>
          <LeversTable result={result.levers} />
        </>
      ) : (
        <div style={{ fontSize: 13.5, color: '#C9CDD8', lineHeight: 1.55 }}>
          See how much each change would move your odds: spending less, retiring later, saving more, claiming Social Security at 70, flexible spending, more bonds — plus what a crash or lower returns would do.
        </div>
      )}
    </section>
  )
}
