import { useState } from 'react'
import PublicShell, { SignupCta, Explainer } from '../../components/public/PublicShell'
import CalcField from '../../components/public/CalcField'
import LineChart, { ChartLegend } from '../../components/dashboard/LineChart'
import { computeFire, fireNumber } from '../../lib/calculators'
import { monthsLabel } from '../../lib/debts'
import { fmtUSD, fmtCompact } from '../../lib/portfolio'
import { CALCULATOR_PAGES } from '../../lib/calculatorPages'
import { useSeo } from '../../lib/useSeo'
import { useIsMobile } from '../../lib/useIsMobile'
import { panel, statTile, statLabel } from '../../components/ui/styles'

const PAGE = CALCULATOR_PAGES.find((p) => p.path === '/calculators/fire')!

export default function FireCalculator() {
  useSeo(PAGE.title, PAGE.description)
  const isMobile = useIsMobile()
  const [inp, setInp] = useState({
    currentAge: 30,
    annualExpenses: 50000,
    currentSavings: 100000,
    monthlySavings: 2500,
    expectedReturnPct: 7,
    inflationPct: 3,
    withdrawalRatePct: 4,
  })
  const set = (k: keyof typeof inp) => (n: number) => setInp((p) => ({ ...p, [k]: n }))
  const r = computeFire(inp)

  const whatIf = [0, 500, 1000, 2000].map((extra) => {
    const x = computeFire({ ...inp, monthlySavings: inp.monthlySavings + extra })
    return { extra, age: x.fireAge }
  })
  const rates = [3.5, 4, 4.5].map((w) => {
    const x = computeFire({ ...inp, withdrawalRatePct: w })
    return { w, number: fireNumber(inp.annualExpenses, w), age: x.fireAge }
  })

  return (
    <PublicShell>
      <header>
        <h1 style={{ margin: 0, fontFamily: "'Space Grotesk'", fontSize: isMobile ? 28 : 36, fontWeight: 700, letterSpacing: -0.8 }}>FIRE calculator</h1>
        <p style={{ margin: '8px 0 0', color: '#C9CDD8', fontSize: 15, lineHeight: 1.55, maxWidth: 720 }}>
          Financial Independence, Retire Early: how big your portfolio needs to be to live off it, and when you'll get there. All figures are in today's dollars.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '340px 1fr', gap: 20, alignItems: 'start' }}>
        <section style={panel}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <CalcField label="Current age" value={inp.currentAge} onChange={set('currentAge')} integer min={15} max={90} span />
            <CalcField label="Annual spending" value={inp.annualExpenses} onChange={set('annualExpenses')} prefix="$" step={1000} span hint="What you expect to spend each year once retired" />
            <CalcField label="Invested today" value={inp.currentSavings} onChange={set('currentSavings')} prefix="$" step={5000} span />
            <CalcField label="Saving per month" value={inp.monthlySavings} onChange={set('monthlySavings')} prefix="$" step={100} span />
            <CalcField label="Expected return" value={inp.expectedReturnPct} onChange={set('expectedReturnPct')} suffix="%" step={0.1} />
            <CalcField label="Inflation" value={inp.inflationPct} onChange={set('inflationPct')} suffix="%" step={0.1} />
            <CalcField label="Withdrawal rate" value={inp.withdrawalRatePct} onChange={set('withdrawalRatePct')} suffix="%" step={0.1} min={1} max={10} span hint="4% is the classic “safe withdrawal rate”" />
          </div>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 12 }}>
            <div style={{ ...statTile, background: 'linear-gradient(135deg,#ff5a00,#ffae00)', gridColumn: isMobile ? '1 / -1' : undefined }}>
              <div style={{ ...statLabel, color: 'rgba(255,255,255,0.85)' }}>Your FIRE number</div>
              <div style={{ fontFamily: "'Space Grotesk'", fontSize: 30, fontWeight: 700, color: '#fff', margin: '6px 0 2px' }}>{fmtUSD(r.fireNumber)}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>{(100 / inp.withdrawalRatePct).toFixed(0)}× annual spending</div>
            </div>
            <div style={statTile}>
              <div style={statLabel}>Financially independent at</div>
              <div style={{ fontFamily: "'Space Grotesk'", fontSize: 26, fontWeight: 700, margin: '6px 0 2px', color: r.fireAge != null ? '#22E38A' : '#FF5470' }}>{r.fireAge == null ? 'Not yet' : `Age ${Math.ceil(r.fireAge)}`}</div>
              <div style={{ fontSize: 12, color: '#8A90A2' }}>{r.monthsToFire == null ? 'save more or spend less' : r.monthsToFire === 0 ? 'you’re already there' : `in ${monthsLabel(r.monthsToFire)}`}</div>
            </div>
            <div style={statTile}>
              <div style={statLabel}>Progress</div>
              <div style={{ fontFamily: "'Space Grotesk'", fontSize: 26, fontWeight: 700, margin: '6px 0 2px' }}>{Math.min(999, (inp.currentSavings / r.fireNumber) * 100).toFixed(0)}%</div>
              <div style={{ fontSize: 12, color: '#8A90A2' }}>{fmtCompact(inp.currentSavings)} of {fmtCompact(r.fireNumber)}</div>
            </div>
          </div>

          <section style={panel}>
            <div style={{ fontFamily: "'Space Grotesk'", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Portfolio by age</div>
            <LineChart
              series={[{ key: 'b', label: 'Portfolio', color: '#22E38A', values: r.balances, area: true }]}
              labels={r.ages.map((a) => `Age ${a}`)}
              tickFormat={(i) => String(r.ages[i] ?? '')}
              yFormat={fmtCompact}
              refLines={[{ value: r.fireNumber, label: `FIRE number ${fmtCompact(r.fireNumber)}`, color: '#FF7A00' }]}
              zeroBased
            />
            <ChartLegend items={[{ color: '#22E38A', label: `Portfolio (${r.realReturnPct.toFixed(1)}% real return)` }, { color: '#FF7A00', label: 'FIRE number', dashed: true }]} />
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
            <section style={panel}>
              <div style={{ fontFamily: "'Space Grotesk'", fontSize: 15, fontWeight: 600, marginBottom: 10 }}>What if you saved more?</div>
              {whatIf.map((w) => (
                <div key={w.extra} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ color: '#C9CDD8' }}>{w.extra === 0 ? 'Current plan' : `+${fmtUSD(w.extra)}/mo`}</span>
                  <b style={{ color: w.extra === 0 ? '#F2F4F8' : '#22E38A' }}>{w.age == null ? '—' : `Age ${Math.ceil(w.age)}`}</b>
                </div>
              ))}
            </section>
            <section style={panel}>
              <div style={{ fontFamily: "'Space Grotesk'", fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Withdrawal rate</div>
              {rates.map((x) => (
                <div key={x.w} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ color: '#C9CDD8' }}>{x.w}%</span>
                  <span>{fmtCompact(x.number)}</span>
                  <b>{x.age == null ? '—' : `Age ${Math.ceil(x.age)}`}</b>
                </div>
              ))}
              <div style={{ fontSize: 12, color: '#8A90A2', marginTop: 8 }}>
                Lean FIRE (70% spending): {fmtCompact(r.leanFire)} · Fat FIRE (150%): {fmtCompact(r.fatFire)}
              </div>
            </section>
          </div>
        </div>
      </div>

      <SignupCta headline="Track your real FIRE progress" body="Connect the dots automatically: live prices for your stocks, crypto and gold, real net-worth history, and a full retirement simulation with taxes, Social Security and Monte Carlo odds." />

      <Explainer
        items={[
          { q: 'What is a FIRE number?', a: <>It's the portfolio size that can fund your spending indefinitely. Divide annual spending by your withdrawal rate — at 4%, that's 25× what you spend. Spend $50,000 a year and your FIRE number is $1.25 million.</> },
          { q: 'Why real returns?', a: <>Everything is shown in today's dollars. The calculator grows your savings at the real return — roughly your expected return minus inflation — so the FIRE number doesn't have to keep rising with prices.</> },
          { q: 'Is 4% safe?', a: <>The 4% rule comes from studies of 30-year US retirements. Retiring earlier means your money must last longer, so many early retirees plan on 3.25–3.5% for extra margin.</> },
        ]}
      />
    </PublicShell>
  )
}
