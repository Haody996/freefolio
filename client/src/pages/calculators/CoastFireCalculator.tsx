import { useState } from 'react'
import PublicShell, { SignupCta, Explainer } from '../../components/public/PublicShell'
import CalcField from '../../components/public/CalcField'
import LineChart, { ChartLegend } from '../../components/dashboard/LineChart'
import { computeCoast } from '../../lib/calculators'
import { fmtUSD, fmtCompact } from '../../lib/portfolio'
import { CALCULATOR_PAGES } from '../../lib/calculatorPages'
import { useSeo } from '../../lib/useSeo'
import { useIsMobile } from '../../lib/useIsMobile'
import { panel, statTile, statLabel } from '../../components/ui/styles'

const PAGE = CALCULATOR_PAGES.find((p) => p.path === '/calculators/coast-fire')!

export default function CoastFireCalculator() {
  useSeo(PAGE.title, PAGE.description)
  const isMobile = useIsMobile()
  const [inp, setInp] = useState({
    currentAge: 32,
    retirementAge: 60,
    annualExpenses: 50000,
    currentSavings: 150000,
    monthlySavings: 1500,
    expectedReturnPct: 7,
    inflationPct: 3,
    withdrawalRatePct: 4,
  })
  const set = (k: keyof typeof inp) => (n: number) => setInp((p) => ({ ...p, [k]: n }))
  const r = computeCoast(inp)

  return (
    <PublicShell>
      <header>
        <h1 style={{ margin: 0, fontFamily: "'Space Grotesk'", fontSize: isMobile ? 28 : 36, fontWeight: 700, letterSpacing: -0.8 }}>Coast FIRE calculator</h1>
        <p style={{ margin: '8px 0 0', color: '#C9CDD8', fontSize: 15, lineHeight: 1.55, maxWidth: 720 }}>
          Coast FIRE means you've invested enough that growth alone gets you to your FIRE number by retirement. After that, you only need to earn what you spend. Figures are in today's dollars.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '340px 1fr', gap: 20, alignItems: 'start' }}>
        <section style={panel}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <CalcField label="Current age" value={inp.currentAge} onChange={set('currentAge')} integer min={15} max={90} />
            <CalcField label="Retire at" value={inp.retirementAge} onChange={set('retirementAge')} integer min={20} max={90} />
            <CalcField label="Annual spending in retirement" value={inp.annualExpenses} onChange={set('annualExpenses')} prefix="$" step={1000} span />
            <CalcField label="Invested today" value={inp.currentSavings} onChange={set('currentSavings')} prefix="$" step={5000} span />
            <CalcField label="Saving per month (until you coast)" value={inp.monthlySavings} onChange={set('monthlySavings')} prefix="$" step={100} span />
            <CalcField label="Expected return" value={inp.expectedReturnPct} onChange={set('expectedReturnPct')} suffix="%" step={0.1} />
            <CalcField label="Inflation" value={inp.inflationPct} onChange={set('inflationPct')} suffix="%" step={0.1} />
            <CalcField label="Withdrawal rate" value={inp.withdrawalRatePct} onChange={set('withdrawalRatePct')} suffix="%" step={0.1} min={1} max={10} span />
          </div>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div
            style={{
              borderRadius: 16,
              padding: '18px 20px',
              background: r.reached ? 'rgba(34,227,138,0.08)' : 'rgba(255,176,32,0.08)',
              border: `1px solid ${r.reached ? 'rgba(34,227,138,0.3)' : 'rgba(255,176,32,0.3)'}`,
              fontSize: 15,
              lineHeight: 1.55,
              color: '#E7EAF1',
            }}
          >
            {r.reached ? (
              <>
                <b style={{ color: '#22E38A' }}>You've hit Coast FIRE.</b> Without saving another dollar, {fmtUSD(inp.currentSavings)} grows to about{' '}
                <b>{fmtUSD(r.projectedAtRetirement)}</b> by age {inp.retirementAge} — beyond your {fmtUSD(r.fireNumber)} FIRE number.
              </>
            ) : (
              <>
                <b style={{ color: '#FFB020' }}>{fmtUSD(r.gap)} to go.</b> You need {fmtUSD(r.coastNumber)} invested today to coast to {fmtUSD(r.fireNumber)} by age {inp.retirementAge}.{' '}
                {r.coastAge != null ? (
                  <>
                    Saving {fmtUSD(inp.monthlySavings)}/mo, you reach Coast FIRE at <b style={{ color: '#22E38A' }}>age {Math.ceil(r.coastAge)}</b>.
                  </>
                ) : (
                  <>At your current savings rate you won't reach it before retirement.</>
                )}
              </>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12 }}>
            <Stat label="Coast number today" value={fmtCompact(r.coastNumber)} color="#22E38A" />
            <Stat label="FIRE number" value={fmtCompact(r.fireNumber)} />
            <Stat label="Coast FIRE age" value={r.coastAge == null ? '—' : String(Math.ceil(r.coastAge))} />
            <Stat label={`If you stop saving`} value={fmtCompact(r.projectedAtRetirement)} sub={`at ${inp.retirementAge}`} />
          </div>

          <section style={panel}>
            <div style={{ fontFamily: "'Space Grotesk'", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Coast number vs. your portfolio</div>
            <LineChart
              series={[
                { key: 'req', label: 'Needed to coast', color: '#FFB020', values: r.required, dashed: true },
                { key: 'bal', label: 'Your portfolio', color: '#22E38A', values: r.projected, area: true },
              ]}
              labels={r.ages.map((a) => `Age ${a}`)}
              tickFormat={(i) => String(r.ages[i] ?? '')}
              yFormat={fmtCompact}
              zeroBased
            />
            <ChartLegend items={[{ color: '#22E38A', label: 'Your portfolio, still saving' }, { color: '#FFB020', label: 'Needed to coast from that age', dashed: true }]} />
          </section>
        </div>
      </div>

      <SignupCta headline="Know the moment you can coast" body="getfreefolio tracks your investments with live prices and shows your FIRE progress every day — plus an optional weekly email digest." />

      <Explainer
        items={[
          { q: 'How is the Coast FIRE number calculated?', a: <>Take your FIRE number (annual spending ÷ withdrawal rate) and discount it back to today at your real return: FIRE number ÷ (1 + real return)^years until retirement.</> },
          { q: 'What happens after I coast?', a: <>You can stop contributing to retirement accounts and take a lower-paying or part-time job — you just need to cover your spending until your target retirement age.</> },
          { q: 'What are the risks?', a: <>Coast FIRE leans on decades of compounding, so a lower-than-expected return matters. Using a conservative real return (4–5%) gives you margin.</> },
        ]}
      />
    </PublicShell>
  )
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={statTile}>
      <div style={statLabel}>{label}</div>
      <div style={{ fontFamily: "'Space Grotesk'", fontSize: 23, fontWeight: 700, margin: '6px 0 2px', color: color ?? '#F2F4F8' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#8A90A2' }}>{sub}</div>}
    </div>
  )
}
