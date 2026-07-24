import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { useIsMobile } from '../lib/useIsMobile'
import Spinner from '../components/ui/Spinner'
import RetirementChart from '../components/dashboard/RetirementChart'
import { computeTotals, fmtUSD, fmtCompact } from '../lib/portfolio'
import type { Holding } from '../lib/portfolio'
import { simulateRetirement } from '../lib/retirement'
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

export default function Retirement() {
  const isMobile = useIsMobile()
  const [plan, setPlan] = useState<Plan | null>(null)

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
    </>
  )
}
