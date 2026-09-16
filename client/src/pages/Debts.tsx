import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../lib/api'
import { useIsMobile } from '../lib/useIsMobile'
import Spinner from '../components/ui/Spinner'
import LiabilityModal from '../components/dashboard/LiabilityModal'
import type { LiabilityPayload } from '../components/dashboard/LiabilityModal'
import DebtPlanner from '../components/dashboard/DebtPlanner'
import type { DebtStrategy } from '../lib/debts'
import { fmtUSD, liabilityLabel, liabilityColor, totalDebt, pct } from '../lib/portfolio'
import type { Holding, Liability } from '../lib/portfolio'
import { panel, panelTitle, pageTitle, primaryBtn } from '../components/ui/styles'

export default function Debts() {
  const qc = useQueryClient()
  const isMobile = useIsMobile()
  const [modal, setModal] = useState<{ editing: Liability | null } | null>(null)

  const liabilitiesQ = useQuery<{ liabilities: Liability[] }>({
    queryKey: ['liabilities'],
    queryFn: async () => (await api.get('/liabilities')).data,
  })
  const holdingsQ = useQuery<{ holdings: Holding[] }>({
    queryKey: ['holdings'],
    queryFn: async () => (await api.get('/holdings')).data,
  })
  const settingsQ = useQuery<{ settings: Record<string, unknown> }>({
    queryKey: ['projection'],
    queryFn: async () => (await api.get('/projection')).data,
  })

  // Strategy + extra payment persist to the plan (the retirement sim uses them).
  const [strategy, setStrategy] = useState<DebtStrategy>('AVALANCHE')
  const [extra, setExtra] = useState(0)
  const seeded = useRef(false)
  useEffect(() => {
    const s = settingsQ.data?.settings
    if (s && !seeded.current) {
      seeded.current = true
      setStrategy(s.debtStrategy === 'SNOWBALL' ? 'SNOWBALL' : 'AVALANCHE')
      setExtra(Number(s.debtExtraPayment) || 0)
    }
  }, [settingsQ.data])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function persist(next: { debtStrategy: DebtStrategy; debtExtraPayment: number }) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await api.put('/projection', next)
      qc.invalidateQueries({ queryKey: ['projection'] })
    }, 500)
  }

  function invalidate() {
    for (const key of ['liabilities', 'networth', 'holdings']) qc.invalidateQueries({ queryKey: [key] })
  }
  const save = useMutation({
    mutationFn: async ({ id, p }: { id: string | null; p: LiabilityPayload }) =>
      id ? (await api.put(`/liabilities/${id}`, p)).data : (await api.post('/liabilities', p)).data,
    onSuccess: async (_d, vars) => {
      invalidate()
      setModal(null)
      // A newly added debt existed before today too — rebuild net-worth history.
      if (!vars.id) {
        await api.post('/networth/backfill?days=365').catch(() => undefined)
        qc.invalidateQueries({ queryKey: ['networth'] })
      }
    },
  })
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/liabilities/${id}`)).data,
    onSuccess: () => {
      invalidate()
      setModal(null)
    },
  })

  if (liabilitiesQ.isLoading || settingsQ.isLoading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    )
  }

  const liabilities = liabilitiesQ.data?.liabilities ?? []
  const holdings = holdingsQ.data?.holdings ?? []
  const debt = totalDebt(liabilities)
  const monthly = liabilities.reduce((s, l) => s + l.minPayment, 0)
  const avgApr = debt ? liabilities.reduce((s, l) => s + l.balance * l.interestRatePct, 0) / debt : 0

  return (
    <>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={pageTitle}>Debts</h1>
          <div style={{ color: '#8A90A2', fontSize: 13, marginTop: 4 }}>Everything you owe, and the fastest way to pay it off.</div>
        </div>
        <button onClick={() => setModal({ editing: null })} style={primaryBtn}>
          + Add debt
        </button>
      </header>

      {liabilities.length === 0 ? (
        <section style={{ ...panel, textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700 }}>No debts tracked</div>
          <div style={{ color: '#8A90A2', fontSize: 13.5, margin: '8px auto 18px', maxWidth: 440, lineHeight: 1.55 }}>
            Add your mortgage, car loan, student loans or credit cards. They'll come off your net worth, and you'll get an avalanche vs. snowball payoff plan.
          </div>
          <button onClick={() => setModal({ editing: null })} style={primaryBtn}>
            + Add your first debt
          </button>
        </section>
      ) : (
        <>
          <section style={panel}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
              <Tile label="Total owed" value={fmtUSD(debt)} color="#FF5470" />
              <Tile label="Minimum payments" value={`${fmtUSD(monthly)}/mo`} />
              <Tile label="Avg interest rate" value={`${avgApr.toFixed(2)}%`} sub="balance-weighted" />
            </div>
            <div style={{ ...panelTitle, fontSize: 14, marginBottom: 6, color: '#C9CDD8' }}>Your debts</div>
            {[...liabilities]
              .sort((a, b) => b.interestRatePct - a.interestRatePct)
              .map((l) => {
                const secured = l.holdingId ? holdings.find((h) => h.id === l.holdingId) : undefined
                const monthlyInterest = (l.balance * l.interestRatePct) / 100 / 12
                return (
                  <div
                    key={l.id}
                    onClick={() => setModal({ editing: l })}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px', borderTop: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}
                    title="Click to edit"
                  >
                    <span style={{ width: 8, alignSelf: 'stretch', borderRadius: 4, background: liabilityColor(l.type), flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {l.name} <span style={{ fontSize: 12, fontWeight: 500, color: '#8A90A2' }}>· {liabilityLabel(l.type)}{l.institution ? ` · ${l.institution}` : ''}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#8A90A2' }}>
                        {l.interestRatePct}% APR · {fmtUSD(l.minPayment)}/mo · {fmtUSD(monthlyInterest)}/mo interest
                        {secured && (
                          <>
                            {' '}· secured by {secured.name || secured.symbol} (equity {fmtUSD(secured.quantity * secured.price - l.balance)}, {pct(secured.quantity * secured.price ? l.balance / (secured.quantity * secured.price) : 0)} LTV)
                          </>
                        )}
                        {l.minPayment <= monthlyInterest && l.balance > 0 && <span style={{ color: '#FF5470' }}> · payment doesn't cover interest</span>}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#FF5470', whiteSpace: 'nowrap' }}>{fmtUSD(l.balance)}</div>
                  </div>
                )
              })}
          </section>

          <DebtPlanner
            debts={liabilities.map((l) => ({ id: l.id, name: l.name, balance: l.balance, ratePct: l.interestRatePct, minPayment: l.minPayment }))}
            strategy={strategy}
            extra={extra}
            onStrategy={(s) => {
              setStrategy(s)
              persist({ debtStrategy: s, debtExtraPayment: extra })
            }}
            onExtra={(n) => {
              setExtra(n)
              persist({ debtStrategy: strategy, debtExtraPayment: n })
            }}
            footer={
              <>
                Your <Link to="/retirement">retirement plan</Link> uses this strategy and extra payment: debt payments that end before you retire can flow into savings, and any still due afterwards are added to retirement spending.
              </>
            }
          />
        </>
      )}

      {modal && (
        <LiabilityModal
          editing={modal.editing}
          securable={holdings.filter((h) => h.category === 'REAL_ESTATE' || h.category === 'VEHICLE')}
          saving={save.isPending}
          error={save.isError ? 'Could not save — try again.' : undefined}
          onClose={() => setModal(null)}
          onSave={(p) => save.mutate({ id: modal.editing?.id ?? null, p })}
          onDelete={(l) => remove.mutate(l.id)}
        />
      )}
    </>
  )
}

function Tile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 11, letterSpacing: 0.8, color: '#8A90A2', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: "'Space Grotesk'", fontSize: 22, fontWeight: 700, margin: '7px 0 2px', color: color ?? '#F2F4F8', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#8A90A2' }}>{sub}</div>}
    </div>
  )
}
