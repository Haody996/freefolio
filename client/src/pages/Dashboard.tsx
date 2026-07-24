import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { clearAuth } from '../lib/auth'
import { useIsMobile } from '../lib/useIsMobile'
import Spinner from '../components/ui/Spinner'
import Sidebar from '../components/dashboard/Sidebar'
import NetWorthPanel from '../components/dashboard/NetWorthPanel'
import type { Range } from '../components/dashboard/NetWorthPanel'
import DonutChart from '../components/dashboard/DonutChart'
import ProjectionChart from '../components/dashboard/ProjectionChart'
import HoldingModal from '../components/dashboard/HoldingModal'
import type { SavePayload } from '../components/dashboard/HoldingModal'
import EditableNumber from '../components/dashboard/EditableNumber'
import {
  computeTotals,
  computeAllocation,
  computeProjection,
  fallbackHistory,
  fmtUSD,
  fmtCompact,
  signedUSD,
  signedPct,
  pct,
  mask,
  catColor,
  CAT_LABEL,
} from '../lib/portfolio'
import type { Holding, ProjectionInput } from '../lib/portfolio'

interface ProjectionSettings {
  startingCapital: number | null
  monthlyContribution: number
  expectedReturnPct: number
  years: number
  inflationPct: number
}

const panel: React.CSSProperties = {
  background: '#16181F',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 18,
  padding: 24,
}
const panelTitle: React.CSSProperties = {
  fontFamily: "'Space Grotesk'",
  fontSize: 16,
  fontWeight: 600,
  marginBottom: 14,
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function Dashboard() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const [privacy, setPrivacy] = useState(false)
  const [range, setRange] = useState<Range>('1Y')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Holding | null>(null)
  const [proj, setProj] = useState<ProjectionInput | null>(null)

  const holdingsQ = useQuery<{ holdings: Holding[] }>({
    queryKey: ['holdings'],
    queryFn: async () => (await api.get('/holdings')).data,
  })
  const historyQ = useQuery<{ history: { date: string; netWorth: number }[] }>({
    queryKey: ['networth', 'history'],
    queryFn: async () => (await api.get('/networth/history')).data,
  })
  const settingsQ = useQuery<{ settings: ProjectionSettings }>({
    queryKey: ['projection'],
    queryFn: async () => (await api.get('/projection')).data,
  })
  const profileQ = useQuery<{ profile: { profile: { firstName: string } | null } }>({
    queryKey: ['profile'],
    queryFn: async () => (await api.get('/profile')).data,
  })

  const holdings = holdingsQ.data?.holdings ?? []
  const totals = computeTotals(holdings)

  // Seed the projection sliders from saved settings once (and when total changes,
  // only fill an unset starting capital).
  const settings = settingsQ.data?.settings
  useEffect(() => {
    if (settings && !proj) {
      setProj({
        start: settings.startingCapital ?? Math.round(totals.total),
        monthly: settings.monthlyContribution,
        ret: settings.expectedReturnPct,
        years: settings.years,
        infl: settings.inflationPct,
      })
    }
  }, [settings, proj, totals.total])

  // Persist slider changes (debounced).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persistProjection = (p: ProjectionInput) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      api.put('/projection', {
        startingCapital: p.start,
        monthlyContribution: p.monthly,
        expectedReturnPct: p.ret,
        years: p.years,
        inflationPct: p.infl,
      })
    }, 500)
  }
  const setProjField = (field: keyof ProjectionInput, value: number) => {
    setProj((prev) => {
      if (!prev) return prev
      const next = { ...prev, [field]: value }
      persistProjection(next)
      return next
    })
  }

  const saveHolding = useMutation({
    mutationFn: async (p: SavePayload) => {
      if (editing) return (await api.put(`/holdings/${editing.id}`, p)).data
      return (await api.post('/holdings', p)).data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holdings'] })
      qc.invalidateQueries({ queryKey: ['networth'] })
      setModalOpen(false)
    },
  })
  const deleteHolding = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/holdings/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holdings'] })
      qc.invalidateQueries({ queryKey: ['networth'] })
      setModalOpen(false)
    },
  })

  // Reconstruct real net-worth history from market data (CoinGecko/Stooq).
  const backfill = useMutation({
    mutationFn: async () => (await api.post('/networth/backfill?days=365')).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['networth', 'history'] }),
  })

  // Auto-run once when the account has holdings but little real history, so the
  // chart shows real data instead of the synthetic fallback.
  const autoBackfilled = useRef(false)
  const realPoints = historyQ.data?.history?.length ?? 0
  useEffect(() => {
    if (autoBackfilled.current) return
    if (!holdingsQ.isLoading && !historyQ.isLoading && (holdingsQ.data?.holdings.length ?? 0) > 0 && realPoints < 30) {
      autoBackfilled.current = true
      backfill.mutate()
    }
  }, [holdingsQ.isLoading, historyQ.isLoading, holdingsQ.data, realPoints, backfill])

  if (holdingsQ.isLoading || settingsQ.isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    )
  }

  // ─── Derived ───────────────────────────────────────────────────────
  const alloc = computeAllocation(totals)

  // History: use backend snapshots (pinning the last point to the live total),
  // falling back to a seeded walk when there isn't enough real history yet.
  const backend = historyQ.data?.history ?? []
  let hist = backend.map((p) => ({ date: new Date(p.date), value: p.netWorth }))
  if (hist.length >= 2) hist[hist.length - 1] = { date: new Date(), value: totals.total }
  else hist = fallbackHistory(totals.total)
  const values = hist.map((h) => h.value)
  const dates = hist.map((h) => h.date)

  const y1 = values[values.length - 53] ?? values[0]
  const ret1y = y1 ? (totals.total - y1) / y1 : 0
  const cryptoPct = (alloc.find((a) => a.cat === 'CRYPTO')?.pct) ?? 0
  const cashSeg = alloc.find((a) => a.cat === 'CASH') ?? { pct: 0, value: 0 }

  const projection = proj ? computeProjection(proj) : null
  const firstName = profileQ.data?.profile?.profile?.firstName || 'there'
  const retYear = new Date().getFullYear() + (proj?.years ?? 0)

  const stats = [
    { label: 'Today', value: mask(signedUSD(totals.day), privacy), sub: signedPct(totals.dayPct), color: totals.day >= 0 ? '#22E38A' : '#FF5470' },
    { label: '1-Yr Return', value: signedPct(ret1y), sub: 'trailing 12 months', color: ret1y >= 0 ? '#22E38A' : '#FF5470' },
    { label: 'Crypto Exposure', value: pct(cryptoPct), sub: 'of portfolio', color: '#FFB020' },
    { label: 'Cash Buffer', value: pct(cashSeg.pct), sub: mask(fmtCompact(cashSeg.value), privacy), color: '#35A0FF' },
  ]

  const controls: {
    label: string
    format: (n: number) => string
    min: number
    max: number
    step: number
    value: number
    field: keyof ProjectionInput
    allowOverMax?: boolean
    integer?: boolean
  }[] = proj
    ? [
        { label: 'Starting capital', format: (n) => fmtUSD(n), min: 0, max: 1_000_000, step: 5000, value: proj.start, field: 'start', allowOverMax: true },
        { label: 'Monthly contribution', format: (n) => fmtUSD(n), min: 0, max: 15_000, step: 250, value: proj.monthly, field: 'monthly', allowOverMax: true },
        { label: 'Annual return', format: (n) => n + '%', min: 0, max: 15, step: 0.5, value: proj.ret, field: 'ret' },
        { label: 'Time horizon', format: (n) => n + ' yrs', min: 1, max: 50, step: 1, value: proj.years, field: 'years', integer: true },
        { label: 'Inflation', format: (n) => n + '%', min: 0, max: 8, step: 0.5, value: proj.infl, field: 'infl' },
      ]
    : []

  function openAdd() {
    setEditing(null)
    setModalOpen(true)
  }
  function openEdit(h: Holding) {
    setEditing(h)
    setModalOpen(true)
  }
  function logout() {
    clearAuth()
    navigate('/login')
  }

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: '100vh', background: '#0E0F13', color: '#F2F4F8', fontFamily: "'Manrope', system-ui, sans-serif" }}>
      <Sidebar netWorth={totals.total} onLogout={logout} />

      <main style={{ flex: 1, minWidth: 0, padding: isMobile ? '16px 14px' : '30px 38px', display: 'flex', flexDirection: 'column', gap: isMobile ? 16 : 20 }}>
        {/* Header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: "'Space Grotesk'", fontSize: 25, fontWeight: 700, letterSpacing: -0.5 }}>
              {greeting()}, {firstName}
            </h1>
            <div style={{ color: '#8A90A2', fontSize: 13, marginTop: 4 }}>
              Prices synced · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setPrivacy((p) => !p)} style={secondaryBtn}>
              {privacy ? 'Show' : 'Hide'} balances
            </button>
            <button onClick={openAdd} style={primaryBtn}>
              + Add holding
            </button>
          </div>
        </header>

        {/* Net worth */}
        <NetWorthPanel
          values={values}
          dates={dates}
          total={totals.total}
          day={totals.day}
          dayPct={totals.dayPct}
          privacy={privacy}
          range={range}
          onRange={setRange}
          onSyncHistory={() => backfill.mutate()}
          syncingHistory={backfill.isPending}
        />

        {/* Allocation + Snapshot */}
        <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '420px 1fr', gap: isMobile ? 16 : 20 }}>
          <div style={panel}>
            <div style={panelTitle}>Allocation</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flexShrink: 0 }}>
                <DonutChart alloc={alloc} total={totals.total} privacy={privacy} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11, flex: 1, minWidth: 0 }}>
                {alloc.map((a) => (
                  <div key={a.cat} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, minWidth: 0 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, flexShrink: 0, background: a.color }} />
                    <span style={{ color: '#C9CDD8', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {CAT_LABEL[a.cat]}
                    </span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0 }}>{pct(a.pct)}</span>
                    <span style={{ color: '#8A90A2', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {mask(fmtCompact(a.value), privacy)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={panel}>
            <div style={panelTitle}>Snapshot</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {stats.map((s) => (
                <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 16 }}>
                  <div style={{ fontSize: 11, letterSpacing: 0.8, color: '#8A90A2', fontWeight: 700, textTransform: 'uppercase' }}>{s.label}</div>
                  <div style={{ fontFamily: "'Space Grotesk'", fontSize: 23, fontWeight: 700, margin: '7px 0 3px', color: s.color, fontVariantNumeric: 'tabular-nums' }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: 12, color: '#8A90A2' }}>{s.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Holdings */}
        <section style={panel}>
          <div style={panelTitle}>Holdings</div>
          {!isMobile && (
            <div style={{ ...holdingsGrid, padding: '0 4px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', fontSize: 11, letterSpacing: 0.6, color: '#8A90A2', fontWeight: 700, textTransform: 'uppercase' }}>
              <div>Asset</div>
              <div style={{ textAlign: 'right' }}>Price</div>
              <div style={{ textAlign: 'right' }}>24h</div>
              <div style={{ textAlign: 'right' }}>Holdings</div>
              <div style={{ textAlign: 'right' }}>Value / Alloc</div>
            </div>
          )}
          {totals.en.length === 0 && (
            <div style={{ padding: '28px 4px', textAlign: 'center', color: '#8A90A2', fontSize: 13 }}>
              No holdings yet — hit “+ Add holding” to start.
            </div>
          )}
          {totals.en.map((h) => {
            const shares = h.quantity === 1 || h.category === 'CASH' || h.category === 'OTHER' ? '—' : `${h.quantity}`
            const badge = (
              <span style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: catColor(h.category), color: '#04140C' }}>
                {h.symbol.slice(0, 4)}
              </span>
            )

            // Mobile: compact two-part row (asset left, value/24h right).
            if (isMobile) {
              return (
                <div
                  key={h.id}
                  onClick={() => openEdit(h)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 4px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontVariantNumeric: 'tabular-nums', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    {badge}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{h.symbol}</div>
                      <div style={{ fontSize: 12, color: '#8A90A2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {fmtUSD(h.price, 2)} · {shares}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{mask(fmtUSD(h.value), privacy)}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: h.dayPct >= 0 ? '#22E38A' : '#FF5470' }}>
                      {signedPct(h.dayPct)} · {pct(h.alloc)}
                    </div>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={h.id}
                onClick={() => openEdit(h)}
                title="Click to edit"
                style={{ ...holdingsGrid, padding: '14px 8px', margin: '0 -4px', borderRadius: 10, borderBottom: '1px solid rgba(255,255,255,0.05)', alignItems: 'center', fontVariantNumeric: 'tabular-nums', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {badge}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{h.symbol}</div>
                    <div style={{ fontSize: 12, color: '#8A90A2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 14 }}>{fmtUSD(h.price, 2)}</div>
                <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, color: h.dayPct >= 0 ? '#22E38A' : '#FF5470' }}>{signedPct(h.dayPct)}</div>
                <div style={{ textAlign: 'right', fontSize: 14, color: '#C9CDD8' }}>{shares}</div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{mask(fmtUSD(h.value), privacy)}</div>
                  <div style={{ fontSize: 12, color: '#8A90A2' }}>{pct(h.alloc)}</div>
                </div>
              </div>
            )
          })}
        </section>

        {/* Projection */}
        {projection && proj && (
          <section style={panel}>
            <div style={{ marginBottom: 18 }}>
              <div style={panelTitle}>Compound growth projection</div>
              <div style={{ fontSize: 13, color: '#8A90A2', marginTop: 3 }}>Twist the assumptions to see where you land.</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '290px 1fr', gap: isMobile ? 20 : 28, alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {controls.map((c) => (
                  <div key={c.field} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 13, color: '#8A90A2', fontWeight: 600 }}>{c.label}</span>
                      <EditableNumber
                        value={c.value}
                        format={c.format}
                        min={c.min}
                        max={c.max}
                        allowOverMax={c.allowOverMax}
                        integer={c.integer}
                        onCommit={(n) => setProjField(c.field, n)}
                      />
                    </div>
                    <input
                      type="range"
                      min={c.min}
                      max={c.max}
                      step={c.step}
                      value={c.value}
                      onChange={(e) => setProjField(c.field, +e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
                  <div>
                    <div style={summaryLabel}>Projected · {proj.years}y</div>
                    <div style={{ ...summaryValue, color: '#22E38A' }}>{fmtUSD(projection.finalNom)}</div>
                  </div>
                  <div>
                    <div style={summaryLabel}>In today's dollars</div>
                    <div style={{ ...summaryValue, color: '#9B7CFF' }}>{fmtUSD(projection.finalReal)}</div>
                  </div>
                  <div>
                    <div style={summaryLabel}>Investment gains</div>
                    <div style={{ ...summaryValue, color: '#F2F4F8' }}>{fmtUSD(projection.growth)}</div>
                    <div style={{ fontSize: 12, color: '#8A90A2', marginTop: 2 }}>on {fmtUSD(projection.totalContrib)} contributed</div>
                  </div>
                </div>

                <ProjectionChart p={projection} />

                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12, color: '#8A90A2' }}>
                  {[
                    { c: '#22E38A', l: 'Nominal' },
                    { c: '#9B7CFF', l: 'Real (inflation-adj)' },
                    { c: '#5B6172', l: 'Contributions' },
                  ].map((x) => (
                    <span key={x.l} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 16, height: 3, borderRadius: 2, background: x.c }} />
                      {x.l}
                    </span>
                  ))}
                </div>

                <div style={{ background: 'rgba(34,227,138,0.07)', border: '1px solid rgba(34,227,138,0.22)', borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ fontFamily: "'Space Grotesk'", fontSize: 24, fontWeight: 700, color: '#22E38A', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtUSD(projection.finalReal * 0.04)}
                    <span style={{ fontSize: 14, color: '#8A90A2', fontWeight: 500 }}>/yr</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#C9CDD8' }}>
                    Safe passive income at the 4% rule — enough to consider coasting around{' '}
                    <span style={{ color: '#F2F4F8', fontWeight: 700 }}>{retYear}</span>.
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {modalOpen && (
        <HoldingModal
          editing={editing}
          existing={holdings}
          onClose={() => setModalOpen(false)}
          onSave={(p) => saveHolding.mutate(p)}
          onDelete={(h) => deleteHolding.mutate(h.id)}
        />
      )}
    </div>
  )
}

const secondaryBtn: React.CSSProperties = {
  padding: '11px 16px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.05)',
  color: '#F2F4F8',
  fontWeight: 600,
  fontSize: 13,
  fontFamily: 'inherit',
  cursor: 'pointer',
}
const primaryBtn: React.CSSProperties = {
  padding: '11px 18px',
  borderRadius: 10,
  border: 'none',
  background: '#22E38A',
  color: '#04140C',
  fontWeight: 700,
  fontSize: 13,
  fontFamily: 'inherit',
  cursor: 'pointer',
}
const holdingsGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '2fr 1.1fr 1fr 1fr 1.1fr',
  gap: 12,
}
const summaryLabel: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 0.6,
  color: '#8A90A2',
  fontWeight: 700,
  textTransform: 'uppercase',
}
const summaryValue: React.CSSProperties = {
  fontFamily: "'Space Grotesk'",
  fontSize: 27,
  fontWeight: 700,
  marginTop: 6,
  fontVariantNumeric: 'tabular-nums',
}
