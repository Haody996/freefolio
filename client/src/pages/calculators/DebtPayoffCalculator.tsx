import { useState } from 'react'
import PublicShell, { SignupCta, Explainer } from '../../components/public/PublicShell'
import DebtPlanner from '../../components/dashboard/DebtPlanner'
import type { DebtStrategy } from '../../lib/debts'
import { fmtUSD } from '../../lib/portfolio'
import { CALCULATOR_PAGES } from '../../lib/calculatorPages'
import { useSeo } from '../../lib/useSeo'
import { useIsMobile } from '../../lib/useIsMobile'
import { panel, inputStyle, secondaryBtn } from '../../components/ui/styles'

const PAGE = CALCULATOR_PAGES.find((p) => p.path === '/calculators/debt-payoff')!

interface Row {
  id: string
  name: string
  balance: string
  rate: string
  payment: string
}

let nextId = 4

export default function DebtPayoffCalculator() {
  useSeo(PAGE.title, PAGE.description)
  const isMobile = useIsMobile()
  const [rows, setRows] = useState<Row[]>([
    { id: '1', name: 'Credit card', balance: '6500', rate: '24.9', payment: '180' },
    { id: '2', name: 'Car loan', balance: '14000', rate: '7.5', payment: '350' },
    { id: '3', name: 'Student loan', balance: '22000', rate: '5.5', payment: '240' },
  ])
  const [strategy, setStrategy] = useState<DebtStrategy>('AVALANCHE')
  const [extra, setExtra] = useState(200)

  const update = (id: string, k: keyof Row, v: string) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [k]: v } : r)))
  const debts = rows
    .map((r) => ({ id: r.id, name: r.name.trim() || 'Debt', balance: parseFloat(r.balance) || 0, ratePct: parseFloat(r.rate) || 0, minPayment: parseFloat(r.payment) || 0 }))
    .filter((d) => d.balance > 0)
  const total = debts.reduce((s, d) => s + d.balance, 0)

  const cell: React.CSSProperties = { ...inputStyle, padding: '9px 10px', fontSize: 13.5 }

  return (
    <PublicShell>
      <header>
        <h1 style={{ margin: 0, fontFamily: "'Space Grotesk'", fontSize: isMobile ? 28 : 36, fontWeight: 700, letterSpacing: -0.8 }}>Debt payoff calculator</h1>
        <p style={{ margin: '8px 0 0', color: '#C9CDD8', fontSize: 15, lineHeight: 1.55, maxWidth: 720 }}>
          List your debts, add any extra you can pay each month, and compare the avalanche and snowball methods side by side.
        </p>
      </header>

      <section style={panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: "'Space Grotesk'", fontSize: 16, fontWeight: 600 }}>Your debts</div>
          <div style={{ fontSize: 13, color: '#8A90A2' }}>
            Total <b style={{ color: '#FF5470' }}>{fmtUSD(total)}</b>
          </div>
        </div>
        {!isMobile && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 0.8fr 1fr 36px', gap: 8, fontSize: 11, fontWeight: 700, color: '#8A90A2', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
            <span>Name</span>
            <span>Balance ($)</span>
            <span>APR (%)</span>
            <span>Min payment ($/mo)</span>
            <span />
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 8 }}>
          {rows.map((r) => (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr 1fr' : '1.6fr 1fr 0.8fr 1fr 36px', gap: 8, alignItems: 'center' }}>
              <input aria-label="Debt name" value={r.name} onChange={(e) => update(r.id, 'name', e.target.value)} placeholder="Name" style={{ ...cell, gridColumn: isMobile ? '1 / 3' : undefined }} />
              {isMobile && (
                <button onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} aria-label="Remove debt" style={{ ...secondaryBtn, padding: '9px 0' }}>
                  Remove
                </button>
              )}
              {(
                [
                  ['balance', 'Balance', 'Balance ($)'],
                  ['rate', 'Interest rate', 'APR (%)'],
                  ['payment', 'Minimum payment', 'Min ($/mo)'],
                ] as const
              ).map(([k, aria, short]) =>
                isMobile ? (
                  <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8A90A2', textTransform: 'uppercase', letterSpacing: 0.4 }}>{short}</span>
                    <input aria-label={aria} value={r[k]} onChange={(e) => update(r.id, k, e.target.value)} type="number" inputMode="decimal" placeholder="0" style={cell} />
                  </label>
                ) : (
                  <input key={k} aria-label={aria} value={r[k]} onChange={(e) => update(r.id, k, e.target.value)} type="number" inputMode="decimal" placeholder="0" style={cell} />
                )
              )}
              {!isMobile && (
                <button onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} aria-label="Remove debt" title="Remove" style={{ width: 36, height: 38, borderRadius: 9, border: 'none', background: 'rgba(255,255,255,0.05)', color: '#8A90A2', fontSize: 18, cursor: 'pointer' }}>
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <button onClick={() => setRows((rs) => [...rs, { id: String(nextId++), name: '', balance: '', rate: '', payment: '' }])} style={{ ...secondaryBtn, marginTop: 12 }}>
          + Add a debt
        </button>
      </section>

      {debts.length > 0 ? (
        <DebtPlanner debts={debts} strategy={strategy} extra={extra} onStrategy={setStrategy} onExtra={setExtra} />
      ) : (
        <section style={{ ...panel, color: '#8A90A2', fontSize: 13.5 }}>Enter at least one debt with a balance to see your payoff plan.</section>
      )}

      <SignupCta headline="Pay it off, then track your net worth climb" body="Add your debts to getfreefolio and they come straight off your net worth — with this payoff plan feeding your retirement projection." />

      <Explainer
        items={[
          { q: 'Avalanche or snowball?', a: <>The avalanche method (highest rate first) always costs the least interest. The snowball method (smallest balance first) clears whole debts sooner, which many people find easier to stick with.</> },
          { q: 'How does the rollover work?', a: <>Every debt gets its minimum each month. Your extra payment goes to the target debt, and when a debt is paid off, its minimum rolls into the next one, so your total monthly payment stays the same.</> },
          { q: 'Why does “minimums only” take so long?', a: <>With minimums only, most of each payment on a high-rate card goes to interest. Even a small extra payment shortens the timeline dramatically.</> },
        ]}
      />
    </PublicShell>
  )
}
