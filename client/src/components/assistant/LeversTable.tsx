import { fmtCompact } from '../../lib/portfolio'
import type { LeversResult, Lever } from '../../lib/scenarios'

const tone = (d: number) => (Math.abs(d) < 0.05 ? '#8A90A2' : d > 0 ? '#22E38A' : '#FF5470')

// Ranked what-ifs: each lever re-simulated on the same markets as the plan.
export default function LeversTable({ result, limit }: { result: LeversResult; limit?: number }) {
  const base = result.baseline.successRate * 100
  const improvements = limit ? result.improvements.slice(0, limit) : result.improvements
  const risks = limit ? result.risks.slice(0, Math.max(2, Math.floor(limit / 2))) : result.risks
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, color: '#C9CDD8' }}>
        Current plan: <b style={{ color: '#F2F4F8' }}>{base.toFixed(0)}%</b> chance your money lasts to {result.baseline.endAge}.
      </div>
      <Group title="What would help most" levers={improvements} base={base} />
      {!limit && <Group title="Little or no help for this plan" levers={result.noHelp} base={base} />}
      <Group title="Biggest risks" levers={risks} base={base} />
    </div>
  )
}

function Group({ title, levers, base }: { title: string; levers: Lever[]; base: number }) {
  if (!levers.length) return null
  const max = Math.max(1, ...levers.map((l) => Math.abs(l.deltaSuccess)))
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: '#8A90A2', textTransform: 'uppercase', marginBottom: 6 }}>{title}</div>
      {levers.map((l) => (
        <div key={l.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '4px 12px', alignItems: 'center', padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: 13.5, minWidth: 0 }}>{l.label}</div>
          <div style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap', fontSize: 13 }}>
            <span style={{ color: '#8A90A2' }}>{base.toFixed(0)}% → </span>
            <b style={{ color: tone(l.deltaSuccess) }}>{(l.summary.successRate * 100).toFixed(0)}%</b>
            <span style={{ color: tone(l.deltaSuccess), marginLeft: 6, fontSize: 12 }}>
              {l.deltaSuccess >= 0 ? '+' : ''}
              {l.deltaSuccess.toFixed(0)} pts
            </span>
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 5, borderRadius: 4, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
              <div style={{ width: `${(Math.abs(l.deltaSuccess) / max) * 100}%`, height: '100%', background: tone(l.deltaSuccess), borderRadius: 4 }} />
            </div>
            <span style={{ fontSize: 11.5, color: '#8A90A2', whiteSpace: 'nowrap' }}>
              nest egg {l.deltaNestEgg >= 0 ? '+' : '−'}
              {fmtCompact(Math.abs(l.deltaNestEgg)).replace('−', '')}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
