import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { useIsMobile } from '../lib/useIsMobile'
import Spinner from '../components/ui/Spinner'
import RetirementChart from '../components/dashboard/RetirementChart'
import FanChart from '../components/dashboard/FanChart'
import YearBars from '../components/dashboard/YearBars'
import EditableNumber from '../components/dashboard/EditableNumber'
import NumberInput from '../components/dashboard/NumberInput'
import { computeTotals, computeTaxBreakdown, fmtUSD, fmtCompact, pct } from '../lib/portfolio'
import type { Holding } from '../lib/portfolio'
import { simulateRetirement, backtestRetirement, ssClaimFactor } from '../lib/retirement'
import type { RetirementInput } from '../lib/retirement'

// Bucket split (preTaxPct/rothPct) is derived from holdings, not persisted.
type Plan = Omit<RetirementInput, 'preTaxPct' | 'rothPct'>

const NUM_FIELDS: (keyof Plan)[] = [
  'startingCapital', 'monthlyContribution', 'expectedReturnPct', 'inflationPct',
  'currentAge', 'retirementAge', 'endAge', 'annualSpending', 'vacationBudget',
  'vacationYears', 'taxRatePct', 'socialSecurityAnnual', 'ssStartAge', 'pensionAnnual', 'pensionStartAge',
  'aumFeePct', 'healthcareAnnual', 'healthcareInflationPct',
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
  label, value, onChange, prefix, suffix, integer, step, span,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  prefix?: string
  suffix?: string
  integer?: boolean
  step?: number
  span?: boolean
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: span ? '1 / -1' : undefined }}>
      <span style={{ fontSize: 12, color: '#8A90A2', fontWeight: 600 }}>{label}</span>
      <NumberInput value={value} onChange={onChange} prefix={prefix} suffix={suffix} integer={integer} step={step ?? (integer ? 1 : undefined)} />
    </label>
  )
}

function Toggle({ label, checked, onChange, span }: { label: string; checked: boolean; onChange: (v: boolean) => void; span?: boolean }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer', gridColumn: span ? '1 / -1' : undefined }}>
      <span style={{ fontSize: 13, color: '#C9CDD8', fontWeight: 600 }}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{ width: 40, height: 22, borderRadius: 999, border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0, background: checked ? '#22E38A' : 'rgba(255,255,255,0.14)', transition: 'background .15s', display: 'flex', justifyContent: checked ? 'flex-end' : 'flex-start' }}
      >
        <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff' }} />
      </button>
    </label>
  )
}

function SelectField<T extends string>({ label, value, options, onChange, span }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; span?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: span ? '1 / -1' : undefined }}>
      <span style={{ fontSize: 12, color: '#8A90A2', fontWeight: 600 }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 11px', color: '#F2F4F8', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ background: '#16181F' }}>{o.label}</option>
        ))}
      </select>
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
  const settingsQ = useQuery<{ settings: Record<string, number | string | boolean | null> }>({
    queryKey: ['projection'],
    queryFn: async () => (await api.get('/projection')).data,
  })

  const netWorth = computeTotals(holdingsQ.data?.holdings ?? []).total

  // Seed the plan once from saved settings; startingCapital falls back to net worth.
  const settings = settingsQ.data?.settings
  useEffect(() => {
    if (settings && !plan) {
      const s = settings
      const seeded = {} as Plan
      for (const f of NUM_FIELDS) (seeded as Record<string, unknown>)[f] = Number(s[f] ?? 0)
      if (s.startingCapital == null) seeded.startingCapital = Math.round(netWorth)
      seeded.withdrawalStrategy = s.withdrawalStrategy === 'GUARDRAILS' ? 'GUARDRAILS' : 'FIXED'
      seeded.spendingSmile = s.spendingSmile === true
      seeded.applyRmd = s.applyRmd !== false
      setPlan(seeded)
    }
  }, [settings, plan, netWorth])

  // Persist plan changes (debounced).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function update<K extends keyof Plan>(field: K, value: Plan[K]) {
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

  // Withdrawal buckets are derived from the user's holdings (pre-tax / Roth / taxable).
  const holdings = holdingsQ.data?.holdings ?? []
  const breakdown = computeTaxBreakdown(holdings)
  const preTaxPct = holdings.length ? breakdown.find((b) => b.treatment === 'PRE_TAX')?.pct ?? 0 : 0.5
  const rothPct = holdings.length ? breakdown.find((b) => b.treatment === 'ROTH')?.pct ?? 0 : 0.2
  const taxablePct = Math.max(0, 1 - preTaxPct - rothPct)
  const simInput: RetirementInput = { ...plan, preTaxPct, rothPct }

  const result = simulateRetirement(simInput)
  const yearsToRetire = Math.max(0, plan.retirementAge - plan.currentAge)
  const adjustedSS = plan.socialSecurityAnnual * ssClaimFactor(plan.ssStartAge)

  // Retirement analysis: stress-test the drawdown from an (editable) starting
  // nest egg, defaulting to the projected balance at retirement.
  const effectiveNestEgg = nestEgg ?? Math.round(result.balanceAtRetirement)
  const analysisPlan: RetirementInput = { ...simInput, currentAge: plan.retirementAge, startingCapital: effectiveNestEgg, monthlyContribution: 0 }
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
              <Field label="Current savings" value={plan.startingCapital} onChange={(n) => update('startingCapital', n)} prefix="$" step={1000} span />
              <Field label="Monthly contribution" value={plan.monthlyContribution} onChange={(n) => update('monthlyContribution', n)} prefix="$" step={100} span />
              <Field label="Expected return" value={plan.expectedReturnPct} onChange={(n) => update('expectedReturnPct', n)} suffix="%" step={0.1} />
              <Field label="Inflation" value={plan.inflationPct} onChange={(n) => update('inflationPct', n)} suffix="%" step={0.1} />
            </div>
          </div>

          <div style={panel}>
            <div style={groupTitle}>Retirement spending</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Annual spending" value={plan.annualSpending} onChange={(n) => update('annualSpending', n)} prefix="$" step={1000} span />
              <Field label="Vacation budget" value={plan.vacationBudget} onChange={(n) => update('vacationBudget', n)} prefix="$" step={500} />
              <Field label="for first N years" value={plan.vacationYears} onChange={(n) => update('vacationYears', n)} suffix="yr" integer />
              <Field label="Healthcare / yr" value={plan.healthcareAnnual} onChange={(n) => update('healthcareAnnual', n)} prefix="$" step={500} />
              <Field label="Healthcare inflation" value={plan.healthcareInflationPct} onChange={(n) => update('healthcareInflationPct', n)} suffix="%" step={0.1} />
              <Field label="Effective tax rate" value={plan.taxRatePct} onChange={(n) => update('taxRatePct', n)} suffix="%" step={0.1} span />
            </div>
          </div>

          <div style={panel}>
            <div style={groupTitle}>Strategy &amp; fees</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Advisory / fund fees" value={plan.aumFeePct} onChange={(n) => update('aumFeePct', n)} suffix="%" step={0.1} />
              <SelectField
                label="Withdrawal strategy"
                value={plan.withdrawalStrategy}
                onChange={(v) => update('withdrawalStrategy', v)}
                options={[{ value: 'FIXED', label: 'Fixed spending' }, { value: 'GUARDRAILS', label: 'Guardrails (flex)' }]}
              />
              <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 12, marginTop: 2 }}>
                <Toggle label="Spending smile (real spend declines with age)" checked={plan.spendingSmile} onChange={(v) => update('spendingSmile', v)} />
                <Toggle label="Apply RMDs (required withdrawals at 73+)" checked={plan.applyRmd} onChange={(v) => update('applyRmd', v)} />
              </div>
              <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#8A90A2', lineHeight: 1.5 }}>
                Withdrawals draw <b style={{ color: '#35A0FF' }}>Taxable</b> → <b style={{ color: '#FFB020' }}>Pre-tax</b> → <b style={{ color: '#22E38A' }}>Roth</b>. Your mix:{' '}
                {pct(preTaxPct)} pre-tax · {pct(rothPct)} Roth · {pct(taxablePct)} taxable.
              </div>
            </div>
          </div>

          <div style={panel}>
            <div style={groupTitle}>Guaranteed income</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Social Security /yr (at 67)" value={plan.socialSecurityAnnual} onChange={(n) => update('socialSecurityAnnual', n)} prefix="$" step={1000} />
              <Field label="SS claim age" value={plan.ssStartAge} onChange={(n) => update('ssStartAge', n)} integer />
              <Field label="Pension /yr" value={plan.pensionAnnual} onChange={(n) => update('pensionAnnual', n)} prefix="$" step={1000} />
              <Field label="Pension starts at age" value={plan.pensionStartAge} onChange={(n) => update('pensionStartAge', n)} integer />
              {plan.ssStartAge !== 67 && (
                <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#8A90A2' }}>
                  Claiming at {plan.ssStartAge} → <b style={{ color: plan.ssStartAge > 67 ? '#22E38A' : '#FFB020' }}>{fmtUSD(Math.round(adjustedSS))}/yr</b>{' '}
                  ({plan.ssStartAge > 67 ? '+' : ''}{Math.round((ssClaimFactor(plan.ssStartAge) - 1) * 100)}% vs. age 67).
                </div>
              )}
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
