import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { useIsMobile } from '../lib/useIsMobile'
import Spinner from '../components/ui/Spinner'
import RetirementChart from '../components/dashboard/RetirementChart'
import FanChart from '../components/dashboard/FanChart'
import YearBars from '../components/dashboard/YearBars'
import EditableNumber from '../components/dashboard/EditableNumber'
import { computeTotals, fmtUSD, fmtCompact, pct } from '../lib/portfolio'
import type { Holding } from '../lib/portfolio'
import { simulateRetirement, backtestRetirement } from '../lib/retirement'
import type { RetirementInput } from '../lib/retirement'

type Plan = RetirementInput

const FIELDS: (keyof Plan)[] = [
  'startingCapital', 'monthlyContribution', 'expectedReturnPct', 'inflationPct',
  'currentAge', 'retirementAge', 'endAge', 'annualSpending', 'vacationBudget',
  'vacationYears', 'taxRatePct', 'socialSecurityAnnual', 'ssStartAge', 'pensionAnnual', 'pensionStartAge',
]

const panel: React.CSSProperties = {
  background: '#16181F',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 18,
  padding: 22,
}
const groupTitle: React.CSSProperties = {
  fontFamily: "'Space Grotesk'",
  fontSize: 14,
  fontWeight: 700,
  marginBottom: 14,
  color: '#C9CDD8',
}

function Field({
  label, value, onChange, prefix, suffix, integer, span,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  prefix?: string
  suffix?: string
  integer?: boolean
  span?: boolean
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: span ? '1 / -1' : undefined }}>
      <span style={{ fontSize: 12, color: '#8A90A2', fontWeight: 600 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, background: 'rgba(255,255,255,0.05)' }}>
        {prefix && <span style={{ paddingLeft: 11, color: '#8A90A2', fontSize: 14 }}>{prefix}</span>}
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(integer ? Math.round(+e.target.value) : +e.target.value)}
          style={{ width: '100%', minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#F2F4F8', fontSize: 14, padding: '10px 11px', fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit' }}
        />
        {suffix && <span style={{ paddingRight: 11, color: '#8A90A2', fontSize: 14 }}>{suffix}</span>}
      </div>
    </label>
  )
}

function StatCard({ label, value, sub, color, accent }: { label: string; value: string; sub?: string; color?: string; accent?: boolean }) {
  return (
    <div
      style={{
        borderRadius: 16,
        padding: 18,
        background: accent ? 'linear-gradient(135deg,#7C5CFF,#9B7CFF)' : 'rgba(255,255,255,0.03)',
      }}
    >
      <div style={{ fontSize: 11, letterSpacing: 0.6, color: accent ? 'rgba(255,255,255,0.85)' : '#8A90A2', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: "'Space Grotesk'", fontSize: 26, fontWeight: 700, margin: '6px 0 2px', color: accent ? '#fff' : color || '#F2F4F8', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: accent ? 'rgba(255,255,255,0.85)' : '#8A90A2' }}>{sub}</div>}
    </div>
  )
}

type AnalysisTab = 'probability' | 'confidence' | 'cashflow' | 'withdrawals'

export default function Retirement() {
  const isMobile = useIsMobile()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [tab, setTab] = useState<AnalysisTab>('probability')
  // Analysis "what-if" override for the starting nest egg (null = use projected).
  const [nestEgg, setNestEgg] = useState<number | null>(null)

  const holdingsQ = useQuery<{ holdings: Holding[] }>({
    queryKey: ['holdings'],
    queryFn: async () => (await api.get('/holdings')).data,
  })
  const settingsQ = useQuery<{ settings: Record<string, number | null> }>({
    queryKey: ['projection'],
    queryFn: async () => (await api.get('/projection')).data,
  })

  const netWorth = computeTotals(holdingsQ.data?.holdings ?? []).total

  // Seed the plan once from saved settings; startingCapital falls back to net worth.
  const settings = settingsQ.data?.settings
  useEffect(() => {
    if (settings && !plan) {
      const s = settings as Record<string, number | null>
      const seeded = {} as Plan
      for (const f of FIELDS) seeded[f] = Number(s[f] ?? 0)
      if (s.startingCapital == null) seeded.startingCapital = Math.round(netWorth)
      setPlan(seeded)
    }
  }, [settings, plan, netWorth])

  // Persist plan changes (debounced).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function update(field: keyof Plan, value: number) {
    setPlan((prev) => {
      if (!prev) return prev
      const next = { ...prev, [field]: value }
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => api.put('/projection', next), 500)
      return next
    })
  }

  if (settingsQ.isLoading || !plan) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    )
  }

  const result = simulateRetirement(plan)
  const yearsToRetire = Math.max(0, plan.retirementAge - plan.currentAge)

  // Retirement analysis: stress-test the drawdown from an (editable) starting
  // nest egg, defaulting to the projected balance at retirement.
  const effectiveNestEgg = nestEgg ?? Math.round(result.balanceAtRetirement)
  const analysisPlan: Plan = { ...plan, currentAge: plan.retirementAge, startingCapital: effectiveNestEgg, monthlyContribution: 0 }
  const analysis = simulateRetirement(analysisPlan)
  const backtest = backtestRetirement(analysisPlan)

  // Post-retirement per-year detail for the analysis charts.
  const drawYears = analysis.series.filter((s) => s.phase === 'draw')
  const cashflowData = drawYears.map((s) => ({
    age: s.age,
    segments: [
      { value: s.ss, color: '#35A0FF' },
      { value: s.pension, color: '#9B7CFF' },
      { value: s.netWithdrawal, color: '#22E38A' },
      { value: s.taxes, color: '#FF5470' },
    ],
  }))
  const safeRates = drawYears.filter((s) => s.shortage === 0).map((s) => s.withdrawalRate)
  const wdCap = Math.max(0.06, Math.min(0.15, (safeRates.length ? Math.max(...safeRates) : 0.04) * 1.25))
  const withdrawalData = drawYears.map((s) => ({
    age: s.age,
    segments: [
      s.shortage > 0
        ? { value: wdCap, color: '#FF5470' }
        : { value: Math.min(s.withdrawalRate, wdCap), color: '#F5A524' },
    ],
  }))
  const shortfallYears = drawYears.filter((s) => s.shortage > 0).length
  const stablePct = drawYears.length ? (drawYears.length - shortfallYears) / drawYears.length : 1
  const totalShortage = drawYears.reduce((a, s) => a + s.shortage, 0)

  const successColor = backtest.successRate >= 0.85 ? '#22E38A' : backtest.successRate >= 0.7 ? '#F5A524' : '#FF5470'

  const TABS: { id: AnalysisTab; label: string }[] = [
    { id: 'probability', label: 'Probability' },
    { id: 'confidence', label: 'Confidence' },
    { id: 'cashflow', label: 'Cash flow' },
    { id: 'withdrawals', label: 'Withdrawals' },
  ]

  return (
    <>
      <header>
        <h1 style={{ margin: 0, fontFamily: "'Space Grotesk'", fontSize: 25, fontWeight: 700, letterSpacing: -0.5 }}>Retirement plan</h1>
        <div style={{ color: '#8A90A2', fontSize: 13, marginTop: 4 }}>
          Simulate saving, then drawing down — in today's dollars. Changes save automatically.
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '380px 1fr', gap: isMobile ? 16 : 20, alignItems: 'start' }}>
        {/* Inputs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={panel}>
            <div style={groupTitle}>About you</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Current age" value={plan.currentAge} onChange={(n) => update('currentAge', n)} integer />
              <Field label="Retirement age" value={plan.retirementAge} onChange={(n) => update('retirementAge', n)} integer />
              <Field label="Plan until age" value={plan.endAge} onChange={(n) => update('endAge', n)} integer span />
            </div>
          </div>

          <div style={panel}>
            <div style={groupTitle}>Savings &amp; growth</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Current savings" value={plan.startingCapital} onChange={(n) => update('startingCapital', n)} prefix="$" span />
              <Field label="Monthly contribution" value={plan.monthlyContribution} onChange={(n) => update('monthlyContribution', n)} prefix="$" span />
              <Field label="Expected return" value={plan.expectedReturnPct} onChange={(n) => update('expectedReturnPct', n)} suffix="%" />
              <Field label="Inflation" value={plan.inflationPct} onChange={(n) => update('inflationPct', n)} suffix="%" />
            </div>
          </div>

          <div style={panel}>
            <div style={groupTitle}>Retirement spending</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Annual spending" value={plan.annualSpending} onChange={(n) => update('annualSpending', n)} prefix="$" span />
              <Field label="Vacation budget" value={plan.vacationBudget} onChange={(n) => update('vacationBudget', n)} prefix="$" />
              <Field label="for first N years" value={plan.vacationYears} onChange={(n) => update('vacationYears', n)} suffix="yr" integer />
              <Field label="Effective tax rate" value={plan.taxRatePct} onChange={(n) => update('taxRatePct', n)} suffix="%" span />
            </div>
          </div>

          <div style={panel}>
            <div style={groupTitle}>Guaranteed income</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Social Security /yr" value={plan.socialSecurityAnnual} onChange={(n) => update('socialSecurityAnnual', n)} prefix="$" />
              <Field label="SS starts at age" value={plan.ssStartAge} onChange={(n) => update('ssStartAge', n)} integer />
              <Field label="Pension /yr" value={plan.pensionAnnual} onChange={(n) => update('pensionAnnual', n)} prefix="$" />
              <Field label="Pension starts at age" value={plan.pensionStartAge} onChange={(n) => update('pensionStartAge', n)} integer />
            </div>
          </div>
        </div>

        {/* Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(2, 1fr)', gap: 14 }}>
            <StatCard accent label={`Nest egg at ${plan.retirementAge}`} value={fmtCompact(result.balanceAtRetirement)} sub={`in ${yearsToRetire} years · today's $`} />
            <StatCard
              label="Plan outcome"
              value={result.lasts ? `Lasts to ${plan.endAge}` : `Runs out at ${result.depletedAge}`}
              sub={result.lasts ? `~${fmtCompact(result.endBalance)} left at ${plan.endAge}` : 'Increase savings or trim spending'}
              color={result.lasts ? '#22E38A' : '#FF5470'}
            />
            <StatCard label="Safe income / yr" value={fmtCompact(result.safeAnnualIncome)} sub="4% of nest egg + SS/pension" color="#22E38A" />
            <StatCard label="Suggested nest egg" value={fmtCompact(result.suggestedNestEgg)} sub="25× spending net of income" color="#F2F4F8" />
          </div>

          <div style={panel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <div style={{ fontFamily: "'Space Grotesk'", fontSize: 16, fontWeight: 600 }}>Portfolio balance by age</div>
              <div style={{ fontSize: 12, color: '#8A90A2' }}>real dollars · {result.realReturnPct.toFixed(1)}% real return</div>
            </div>
            <RetirementChart result={result} retirementAge={plan.retirementAge} />
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12, color: '#8A90A2', marginTop: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 16, height: 3, borderRadius: 2, background: result.lasts ? '#22E38A' : '#FFB020' }} /> Balance
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 16, height: 0, borderTop: '2px dashed #9B7CFF' }} /> Retirement age
              </span>
            </div>
          </div>

          <div
            style={{
              background: result.lasts ? 'rgba(34,227,138,0.07)' : 'rgba(255,84,112,0.07)',
              border: `1px solid ${result.lasts ? 'rgba(34,227,138,0.22)' : 'rgba(255,84,112,0.25)'}`,
              borderRadius: 14,
              padding: '16px 18px',
              fontSize: 13.5,
              color: '#C9CDD8',
              lineHeight: 1.55,
            }}
          >
            At age <b style={{ color: '#F2F4F8' }}>{plan.retirementAge}</b> you're projected to have{' '}
            <b style={{ color: '#9B7CFF' }}>{fmtUSD(Math.round(result.balanceAtRetirement))}</b>. Drawing{' '}
            <b style={{ color: '#F2F4F8' }}>{fmtUSD(plan.annualSpending)}</b>/yr (net of Social Security &amp; pension, plus tax),{' '}
            {result.lasts ? (
              <>your savings <b style={{ color: '#22E38A' }}>last through age {plan.endAge}</b> with about{' '}
              <b style={{ color: '#F2F4F8' }}>{fmtUSD(Math.round(result.endBalance))}</b> to spare.</>
            ) : (
              <>your savings <b style={{ color: '#FF5470' }}>run out at age {result.depletedAge}</b>. Try saving more, spending less, or retiring later.</>
            )}
          </div>
        </div>
      </div>

      {/* Retirement Analysis — tabbed Monte Carlo views */}
      <section style={panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700 }}>Retirement analysis</h2>
            <div style={{ fontSize: 13, color: '#8A90A2', marginTop: 3 }}>
              Monte Carlo stress-test · {backtest.trials.toLocaleString()} simulations over ~100 years of market volatility
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 11, flexWrap: 'wrap' }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                  background: tab === t.id ? 'rgba(34,227,138,0.16)' : 'transparent',
                  color: tab === t.id ? '#22E38A' : '#8A90A2',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Editable starting nest egg (defaults to the projected balance at retirement) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16, padding: '12px 14px', borderRadius: 12, background: 'rgba(124,92,255,0.08)', border: '1px solid rgba(124,92,255,0.2)' }}>
          <span style={{ fontSize: 13, color: '#C9CDD8', fontWeight: 600 }}>Starting nest egg at age {plan.retirementAge}:</span>
          <EditableNumber value={effectiveNestEgg} format={(n) => fmtUSD(n)} min={0} max={100_000_000} allowOverMax onCommit={(n) => setNestEgg(n)} />
          {nestEgg != null ? (
            <button onClick={() => setNestEgg(null)} style={{ border: 'none', background: 'transparent', color: '#22E38A', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
              ↺ use projected ({fmtCompact(result.balanceAtRetirement)})
            </button>
          ) : (
            <span style={{ fontSize: 12, color: '#8A90A2' }}>defaults to your projected nest egg — click the value to try a different amount</span>
          )}
        </div>

        {tab === 'probability' && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '260px 1fr', gap: 24, alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: "'Space Grotesk'", fontSize: 52, fontWeight: 700, color: successColor, lineHeight: 1 }}>{pct(backtest.successRate)}</div>
              <div style={{ fontSize: 13, color: '#8A90A2', marginTop: 6 }}>chance your money lasts to age {plan.endAge}</div>
              <div style={{ marginTop: 14, height: 10, borderRadius: 6, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(backtest.successRate * 100).toFixed(1)}%`, background: successColor, borderRadius: 6 }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Stat label="Median ending balance" value={fmtCompact(backtest.medianEnd)} sub={`at age ${plan.endAge}`} />
              <Stat label="Pessimistic (10th pct)" value={fmtCompact(backtest.p10End)} sub="1-in-10 downside" />
              <Stat label="Deterministic path" value={analysis.lasts ? `Lasts to ${plan.endAge}` : `Runs out at ${analysis.depletedAge}`} sub="expected returns" color={analysis.lasts ? '#22E38A' : '#FF5470'} />
              <Stat label="Worst backtest case" value={backtest.worstDepletionAge ? `Depletes at ${backtest.worstDepletionAge}` : 'Always survived'} sub="across all runs" color={backtest.worstDepletionAge ? '#F5A524' : '#22E38A'} />
            </div>
          </div>
        )}

        {tab === 'confidence' && (
          <>
            <div style={{ fontSize: 13, color: '#8A90A2', marginBottom: 8 }}>Range of portfolio outcomes by age (today's dollars).</div>
            <FanChart bands={backtest.bands} retirementAge={plan.retirementAge} />
            <Legend items={[{ c: 'rgba(124,92,255,0.30)', l: '25–75% range' }, { c: 'rgba(124,92,255,0.14)', l: '5–95% range' }, { c: '#7C5CFF', l: 'Median' }]} />
          </>
        )}

        {tab === 'cashflow' && (
          <>
            <div style={{ fontSize: 13, color: '#8A90A2', marginBottom: 8 }}>Where each retirement year's spending comes from, plus tax drag.</div>
            <YearBars data={cashflowData} yFormat={fmtCompact} height={260} />
            <Legend items={[{ c: '#35A0FF', l: 'Social Security' }, { c: '#9B7CFF', l: 'Pension' }, { c: '#22E38A', l: 'Portfolio (net)' }, { c: '#FF5470', l: 'Taxes' }]} />
          </>
        )}

        {tab === 'withdrawals' && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 200px', gap: 20, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, color: '#8A90A2', marginBottom: 8 }}>Portfolio withdrawal rate each year (dashed line = 4% rule).</div>
              <YearBars data={withdrawalData} yFormat={(n) => pct(n)} yMax={wdCap} refLine={{ value: 0.04, label: '4%' }} height={260} />
              <Legend items={[{ c: '#F5A524', l: 'Withdrawal rate' }, { c: '#FF5470', l: 'Shortfall year' }]} />
            </div>
            <div style={{ textAlign: isMobile ? 'left' : 'center' }}>
              <div style={{ fontFamily: "'Space Grotesk'", fontSize: 30, fontWeight: 700 }}>{fmtUSD(Math.round(totalShortage))}</div>
              <div style={{ fontSize: 13, color: '#8A90A2', marginBottom: 14 }}>lifetime income shortfall</div>
              <div style={{ fontFamily: "'Space Grotesk'", fontSize: 30, fontWeight: 700, color: '#22E38A' }}>{pct(stablePct)}</div>
              <div style={{ fontSize: 13, color: '#8A90A2' }}>of retirement years fully funded</div>
            </div>
          </div>
        )}
      </section>
    </>
  )
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: 0.6, color: '#8A90A2', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: "'Space Grotesk'", fontSize: 22, fontWeight: 700, margin: '6px 0 2px', color: color || '#F2F4F8', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#8A90A2' }}>{sub}</div>}
    </div>
  )
}

function Legend({ items }: { items: { c: string; l: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12, color: '#8A90A2', marginTop: 10 }}>
      {items.map((x) => (
        <span key={x.l} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: x.c }} /> {x.l}
        </span>
      ))}
    </div>
  )
}
