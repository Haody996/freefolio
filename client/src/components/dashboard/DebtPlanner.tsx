import { useMemo, useState, useEffect } from 'react'
import { simulatePayoff, monthsLabel, payoffDate } from '../../lib/debts'
import type { DebtInput, DebtStrategy, PayoffPlan } from '../../lib/debts'
import { fmtUSD, fmtCompact } from '../../lib/portfolio'
import { useIsMobile } from '../../lib/useIsMobile'
import LineChart, { ChartLegend } from './LineChart'
import MoneyInput from './MoneyInput'
import { panel, panelTitle, segmented, segmentedWrap } from '../ui/styles'

const STRATEGY_INFO: Record<DebtStrategy, { title: string; blurb: string; color: string }> = {
  AVALANCHE: { title: 'Avalanche', blurb: 'Highest interest rate first — pays the least interest.', color: '#22E38A' },
  SNOWBALL: { title: 'Snowball', blurb: 'Smallest balance first — quick wins keep you motivated.', color: '#35A0FF' },
}

// Avalanche vs snowball vs minimum-only comparison, balance chart and payoff order.
export default function DebtPlanner({
  debts,
  strategy,
  extra,
  onStrategy,
  onExtra,
  footer,
}: {
  debts: DebtInput[]
  strategy: DebtStrategy
  extra: number
  onStrategy: (s: DebtStrategy) => void
  onExtra: (n: number) => void
  footer?: React.ReactNode
}) {
  const isMobile = useIsMobile()
  const [extraText, setExtraText] = useState(String(extra || ''))
  useEffect(() => {
    setExtraText((t) => (parseFloat(t) || 0) === extra ? t : String(extra || ''))
  }, [extra])

  const plans = useMemo(() => {
    const avalanche = simulatePayoff(debts, 'AVALANCHE', extra)
    const snowball = simulatePayoff(debts, 'SNOWBALL', extra)
    const minimum = simulatePayoff(debts, 'MINIMUM')
    return { avalanche, snowball, minimum }
  }, [debts, extra])

  const chosen = strategy === 'AVALANCHE' ? plans.avalanche : plans.snowball
  const other = strategy === 'AVALANCHE' ? plans.snowball : plans.avalanche
  const longest = Math.max(plans.avalanche.balances.length, plans.snowball.balances.length, plans.minimum.balances.length)
  const pad = (p: PayoffPlan) => [...p.balances, ...Array(Math.max(0, longest - p.balances.length)).fill(0)]
  const now = new Date()
  const monthLabel = (i: number) => new Date(now.getFullYear(), now.getMonth() + i, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  const interestDiff = other.totalInterest - chosen.totalInterest

  function setExtraValue(text: string) {
    setExtraText(text)
    const n = parseFloat(text)
    onExtra(isNaN(n) || n < 0 ? 0 : n)
  }

  const card = (key: 'AVALANCHE' | 'SNOWBALL' | 'MINIMUM', plan: PayoffPlan) => {
    const selectable = key !== 'MINIMUM'
    const active = key === strategy
    const saved = plans.minimum.totalInterest - plan.totalInterest
    return (
      <button
        key={key}
        onClick={selectable ? () => onStrategy(key) : undefined}
        aria-pressed={selectable ? active : undefined}
        style={{
          textAlign: 'left',
          fontFamily: 'inherit',
          color: 'inherit',
          cursor: selectable ? 'pointer' : 'default',
          background: active ? 'rgba(34,227,138,0.07)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${active ? 'rgba(34,227,138,0.45)' : 'transparent'}`,
          borderRadius: 14,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: key === 'MINIMUM' ? '#8A90A2' : STRATEGY_INFO[key].color }} />
          <span style={{ fontWeight: 700, fontSize: 14 }}>{key === 'MINIMUM' ? 'Minimums only' : STRATEGY_INFO[key].title}</span>
          {active && <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, color: '#22E38A', letterSpacing: 0.5 }}>YOUR PLAN</span>}
        </div>
        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 21, fontWeight: 700, margin: '8px 0 2px' }}>{plan.months == null ? 'Never' : payoffDate(plan.months)}</div>
        <div style={{ fontSize: 12, color: '#8A90A2' }}>{plan.months == null ? 'payments don’t cover interest' : `debt-free in ${monthsLabel(plan.months)}`}</div>
        <div style={{ fontSize: 12.5, color: '#C9CDD8', marginTop: 8 }}>
          Interest <b style={{ color: '#FF5470' }}>{fmtUSD(plan.totalInterest)}</b>
          {key !== 'MINIMUM' && saved > 1 && plans.minimum.months != null && (
            <span style={{ color: '#22E38A' }}> · saves {fmtUSD(saved)}</span>
          )}
        </div>
      </button>
    )
  }

  return (
    <section style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ ...panelTitle, margin: 0 }}>Payoff plan</div>
        <div style={segmentedWrap} role="group" aria-label="Strategy">
          {(['AVALANCHE', 'SNOWBALL'] as const).map((s) => (
            <button key={s} onClick={() => onStrategy(s)} style={segmented(strategy === s)}>
              {STRATEGY_INFO[s].title}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '260px 1fr', gap: 18, alignItems: 'start', marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#8A90A2', textTransform: 'uppercase', letterSpacing: 0.4 }}>Extra payment / month</label>
          <div style={{ marginTop: 8 }}>
            <MoneyInput value={extraText} onChange={setExtraValue} prefix="$" placeholder="0" ariaLabel="Extra monthly payment" />
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {[100, 250, 500, 1000].map((n) => (
              <button key={n} onClick={() => setExtraValue(String(n))} style={{ ...segmented(extra === n), background: extra === n ? 'rgba(34,227,138,0.16)' : 'rgba(255,255,255,0.05)' }}>
                +${n}
              </button>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 13, color: '#C9CDD8', lineHeight: 1.55 }}>
          {STRATEGY_INFO[strategy].blurb} Each month every debt gets its minimum; the extra payment — plus minimums freed up as debts are paid off — goes to the{' '}
          {strategy === 'AVALANCHE' ? 'highest-rate' : 'smallest'} debt.
          {chosen.months != null && other.months != null && Math.abs(interestDiff) >= 1 && (
            <div style={{ marginTop: 8 }}>
              {interestDiff > 0 ? (
                <>
                  {STRATEGY_INFO[strategy].title} saves <b style={{ color: '#22E38A' }}>{fmtUSD(interestDiff)}</b> in interest vs. {STRATEGY_INFO[other.strategy as DebtStrategy].title.toLowerCase()}.
                </>
              ) : (
                <>
                  {STRATEGY_INFO[other.strategy as DebtStrategy].title} would save <b style={{ color: '#FFB020' }}>{fmtUSD(-interestDiff)}</b> more in interest — {strategy === 'SNOWBALL' ? 'the price of faster early wins.' : ''}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
        {card('AVALANCHE', plans.avalanche)}
        {card('SNOWBALL', plans.snowball)}
        {card('MINIMUM', plans.minimum)}
      </div>

      <div style={{ fontFamily: "'Space Grotesk'", fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Total balance over time</div>
      <LineChart
        series={[
          { key: 'm', label: 'Minimums only', color: '#8A90A2', values: pad(plans.minimum), dashed: true },
          // Your chosen plan draws last so it stays visible where the two overlap.
          ...(strategy === 'AVALANCHE'
            ? [
                { key: 's', label: 'Snowball', color: '#35A0FF', values: pad(plans.snowball) },
                { key: 'a', label: 'Avalanche', color: '#22E38A', values: pad(plans.avalanche), area: true },
              ]
            : [
                { key: 'a', label: 'Avalanche', color: '#22E38A', values: pad(plans.avalanche) },
                { key: 's', label: 'Snowball', color: '#35A0FF', values: pad(plans.snowball), area: true },
              ]),
        ]}
        labels={Array.from({ length: longest }, (_, i) => monthLabel(i))}
        tickFormat={(i) => new Date(now.getFullYear(), now.getMonth() + i, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
        yFormat={fmtCompact}
        zeroBased
        height={240}
      />
      <ChartLegend items={[{ color: '#22E38A', label: 'Avalanche' }, { color: '#35A0FF', label: 'Snowball' }, { color: '#8A90A2', label: 'Minimums only', dashed: true }]} />

      <div style={{ fontFamily: "'Space Grotesk'", fontSize: 15, fontWeight: 600, margin: '20px 0 6px' }}>Payoff order · {STRATEGY_INFO[strategy].title.toLowerCase()}</div>
      <div>
        {chosen.order.map((o, i) => {
          const d = debts.find((x) => x.id === o.id)
          return (
            <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 2px', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 13, fontVariantNumeric: 'tabular-nums', flexWrap: 'wrap' }}>
              <span style={{ width: 24, height: 24, borderRadius: 7, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>{i + 1}</span>
              <span style={{ fontWeight: 700, flex: 1, minWidth: 120 }}>
                {o.name}
                {d && <span style={{ color: '#8A90A2', fontWeight: 500 }}> · {fmtUSD(d.balance)} at {d.ratePct}%</span>}
              </span>
              <span style={{ color: '#8A90A2' }}>interest {fmtUSD(o.interest)}</span>
              <span style={{ fontWeight: 700, minWidth: 90, textAlign: 'right', color: o.month == null ? '#FF5470' : '#F2F4F8' }}>{o.month == null ? 'never' : payoffDate(o.month)}</span>
            </div>
          )
        })}
      </div>
      {footer && <div style={{ fontSize: 12.5, color: '#8A90A2', marginTop: 14, lineHeight: 1.55 }}>{footer}</div>}
    </section>
  )
}
