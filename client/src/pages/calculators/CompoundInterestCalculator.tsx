import { useState } from 'react'
import PublicShell, { SignupCta, Explainer } from '../../components/public/PublicShell'
import CalcField from '../../components/public/CalcField'
import ProjectionChart from '../../components/dashboard/ProjectionChart'
import { ChartLegend } from '../../components/dashboard/LineChart'
import { computeProjection, fmtUSD, fmtCompact } from '../../lib/portfolio'
import { CALCULATOR_PAGES } from '../../lib/calculatorPages'
import { useSeo } from '../../lib/useSeo'
import { useIsMobile } from '../../lib/useIsMobile'
import { panel, statTile, statLabel } from '../../components/ui/styles'

const PAGE = CALCULATOR_PAGES.find((p) => p.path === '/calculators/compound-interest')!

export default function CompoundInterestCalculator() {
  useSeo(PAGE.title, PAGE.description)
  const isMobile = useIsMobile()
  const [inp, setInp] = useState({ start: 10000, monthly: 500, ret: 7, years: 30, infl: 3 })
  const set = (k: keyof typeof inp) => (n: number) => setInp((p) => ({ ...p, [k]: n }))
  const p = computeProjection(inp)
  const multiple = p.totalContrib ? p.finalNom / p.totalContrib : 0

  const th: React.CSSProperties = { padding: '6px 10px', textAlign: 'right', fontWeight: 700, position: 'sticky', top: 0, background: '#16181F' }
  const td: React.CSSProperties = { padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

  return (
    <PublicShell>
      <header>
        <h1 style={{ margin: 0, fontFamily: "'Space Grotesk'", fontSize: isMobile ? 28 : 36, fontWeight: 700, letterSpacing: -0.8 }}>Compound interest calculator</h1>
        <p style={{ margin: '8px 0 0', color: '#C9CDD8', fontSize: 15, lineHeight: 1.55, maxWidth: 720 }}>
          See how a starting balance and steady monthly contributions grow with monthly compounding — in future dollars and in today's purchasing power.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '340px 1fr', gap: 20, alignItems: 'start' }}>
        <section style={panel}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <CalcField label="Starting amount" value={inp.start} onChange={set('start')} prefix="$" step={1000} span />
            <CalcField label="Monthly contribution" value={inp.monthly} onChange={set('monthly')} prefix="$" step={50} span />
            <CalcField label="Annual return" value={inp.ret} onChange={set('ret')} suffix="%" step={0.1} max={50} />
            <CalcField label="Years" value={inp.years} onChange={set('years')} integer min={1} max={70} />
            <CalcField label="Inflation" value={inp.infl} onChange={set('infl')} suffix="%" step={0.1} span />
          </div>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12 }}>
            <div style={{ ...statTile, background: 'linear-gradient(135deg,#7C5CFF,#9B7CFF)' }}>
              <div style={{ ...statLabel, color: 'rgba(255,255,255,0.85)' }}>In {inp.years} years</div>
              <div style={{ fontFamily: "'Space Grotesk'", fontSize: 24, fontWeight: 700, color: '#fff', margin: '6px 0 2px' }}>{fmtCompact(p.finalNom)}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>{multiple.toFixed(1)}× what you put in</div>
            </div>
            <Stat label="In today's dollars" value={fmtCompact(p.finalReal)} color="#9B7CFF" />
            <Stat label="You contribute" value={fmtCompact(p.totalContrib)} color="#35A0FF" />
            <Stat label="Growth" value={fmtCompact(p.growth)} color="#22E38A" />
          </div>

          <section style={panel}>
            <ProjectionChart p={p} />
            <ChartLegend items={[{ color: '#22E38A', label: 'Balance (green band = interest earned)' }, { color: '#35A0FF', label: 'Contributions' }, { color: '#9B7CFF', label: "In today's dollars", dashed: true }]} />
            <div style={{ fontSize: 12, color: '#5B6172', marginTop: 6 }}>Hover or tap the chart to see any year's breakdown.</div>
          </section>

          <section style={panel}>
            <div style={{ fontFamily: "'Space Grotesk'", fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Year by year</div>
            <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: '#8A90A2', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    <th style={{ ...th, textAlign: 'left' }}>Year</th>
                    <th style={th}>Contributed</th>
                    <th style={th}>Growth</th>
                    <th style={th}>Balance</th>
                    <th style={th}>Today's $</th>
                  </tr>
                </thead>
                <tbody>
                  {p.nominal.slice(1).map((v, i) => (
                    <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ ...td, textAlign: 'left' }}>{i + 1}</td>
                      <td style={{ ...td, color: '#35A0FF' }}>{fmtUSD(p.contributed[i + 1])}</td>
                      <td style={{ ...td, color: '#22E38A' }}>{fmtUSD(v - p.contributed[i + 1])}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{fmtUSD(v)}</td>
                      <td style={{ ...td, color: '#9B7CFF' }}>{fmtUSD(p.real[i + 1])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      <SignupCta headline="Put your real portfolio on this curve" body="Track your holdings with live prices, auto-invest schedules and time-weighted returns — then project them forward to retirement." />

      <Explainer
        items={[
          { q: 'How does compounding work here?', a: <>Contributions are added monthly and growth compounds monthly at your annual return ÷ 12. Over long periods, growth on past growth ends up bigger than what you contribute.</> },
          { q: "What are today's dollars?", a: <>Future balances are divided by cumulative inflation, so you can judge what they'd actually buy. At 3% inflation, prices roughly double every 24 years.</> },
          { q: 'What return should I use?', a: <>US stocks have returned about 10% a year historically (roughly 7% after inflation). A mixed stock/bond portfolio is often modeled at 5–7%.</> },
        ]}
      />
    </PublicShell>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={statTile}>
      <div style={statLabel}>{label}</div>
      <div style={{ fontFamily: "'Space Grotesk'", fontSize: 24, fontWeight: 700, margin: '6px 0 2px', color: color ?? '#F2F4F8' }}>{value}</div>
    </div>
  )
}
