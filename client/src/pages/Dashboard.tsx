import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useIsMobile } from '../lib/useIsMobile'
import Spinner from '../components/ui/Spinner'
import NetWorthPanel from '../components/dashboard/NetWorthPanel'
import type { Range } from '../components/dashboard/NetWorthPanel'
import DonutChart from '../components/dashboard/DonutChart'
import InsightsPanel from '../components/dashboard/InsightsPanel'
import HoldingModal from '../components/dashboard/HoldingModal'
import type { SavePayload } from '../components/dashboard/HoldingModal'
import {
  computeTotals,
  computeAllocation,
  computeAllocationSlices,
  accountTreatment,
  fallbackHistory,
  fmtUSD,
  fmtCompact,
  signedUSD,
  signedPct,
  pct,
  mask,
  catColor,
  accountLabel,
  autoFreqShort,
  computeTaxBreakdown,
  computeBrokerageBreakdown,
} from '../lib/portfolio'
import type { Holding } from '../lib/portfolio'

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
  const isMobile = useIsMobile()

  // Persist the hide-balances preference across sessions (per device).
  const [privacy, setPrivacy] = useState(() => localStorage.getItem('freefolio_privacy') === '1')
  function togglePrivacy() {
    setPrivacy((p) => {
      const next = !p
      localStorage.setItem('freefolio_privacy', next ? '1' : '0')
      return next
    })
  }
  const [range, setRange] = useState<Range>('1Y')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Holding | null>(null)

  // Allocation donut: by asset class or by ticker (+ optional index-fund grouping).
  const [allocMode, setAllocMode] = useState<'class' | 'ticker'>(() => (localStorage.getItem('ff_alloc_mode') === 'class' ? 'class' : 'ticker'))
  const [groupIdx, setGroupIdx] = useState(() => localStorage.getItem('ff_alloc_group') !== '0')
  function chooseAllocMode(m: 'class' | 'ticker') {
    localStorage.setItem('ff_alloc_mode', m)
    setAllocMode(m)
  }
  function toggleGroupIdx() {
    setGroupIdx((g) => {
      localStorage.setItem('ff_alloc_group', g ? '0' : '1')
      return !g
    })
  }

  // Holdings filters + sort.
  const [acctFilter, setAcctFilter] = useState<'ALL' | 'PRE_TAX' | 'ROTH' | 'TAXABLE'>('ALL')
  const [brokerFilter, setBrokerFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState<'value' | 'day' | 'ticker' | 'broker'>('value')

  const holdingsQ = useQuery<{ holdings: Holding[] }>({
    queryKey: ['holdings'],
    queryFn: async () => (await api.get('/holdings')).data,
  })
  const historyQ = useQuery<{ history: { date: string; netWorth: number }[] }>({
    queryKey: ['networth', 'history'],
    queryFn: async () => (await api.get('/networth/history')).data,
  })
  const profileQ = useQuery<{ profile: { profile: { firstName: string } | null } }>({
    queryKey: ['profile'],
    queryFn: async () => (await api.get('/profile')).data,
  })

  const holdings = holdingsQ.data?.holdings ?? []
  const totals = computeTotals(holdings)

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

  // Reconstruct real net-worth history from market data (Yahoo/CoinGecko).
  const backfill = useMutation({
    mutationFn: async () => (await api.post('/networth/backfill?days=365')).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['networth', 'history'] }),
  })

  // Auto-run once when the account has holdings but little real history.
  const autoBackfilled = useRef(false)
  const realPoints = historyQ.data?.history?.length ?? 0
  useEffect(() => {
    if (autoBackfilled.current) return
    if (!holdingsQ.isLoading && !historyQ.isLoading && (holdingsQ.data?.holdings.length ?? 0) > 0 && realPoints < 30) {
      autoBackfilled.current = true
      backfill.mutate()
    }
  }, [holdingsQ.isLoading, historyQ.isLoading, holdingsQ.data, realPoints, backfill])

  if (holdingsQ.isLoading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    )
  }

  // ─── Derived ───────────────────────────────────────────────────────
  const alloc = computeAllocation(totals)
  const allocSlices = computeAllocationSlices(holdings, allocMode, groupIdx)
  const taxBreakdown = computeTaxBreakdown(holdings)
  const brokerageBreakdown = computeBrokerageBreakdown(holdings)

  // Holdings filter + sort/rank.
  const brokers = [...new Set(holdings.map((h) => (h.institution || '').trim()).filter(Boolean))].sort()
  const brokerTotals = new Map<string, number>()
  for (const h of totals.en) {
    const k = (h.institution || '').trim() || '—'
    brokerTotals.set(k, (brokerTotals.get(k) || 0) + h.value)
  }
  const filteredRows = totals.en
    .filter((h) => acctFilter === 'ALL' || accountTreatment(h.accountType) === acctFilter)
    .filter((h) => brokerFilter === 'ALL' || ((h.institution || '').trim() || '—') === brokerFilter)
  const sortedRows = [...filteredRows].sort((a, b) => {
    if (sortBy === 'value') return b.value - a.value
    if (sortBy === 'day') return b.dayChg - a.dayChg
    if (sortBy === 'ticker') return a.symbol.localeCompare(b.symbol)
    // by brokerage: rank brokerages by total value, then holdings by value
    const ka = (a.institution || '').trim() || '—'
    const kb = (b.institution || '').trim() || '—'
    const ta = brokerTotals.get(ka) || 0
    const tb = brokerTotals.get(kb) || 0
    if (tb !== ta) return tb - ta
    if (ka !== kb) return ka.localeCompare(kb)
    return b.value - a.value
  })

  const backend = historyQ.data?.history ?? []
  let hist = backend.map((p) => ({ date: new Date(p.date), value: p.netWorth }))
  if (hist.length >= 2) hist[hist.length - 1] = { date: new Date(), value: totals.total }
  else hist = fallbackHistory(totals.total)
  const values = hist.map((h) => h.value)
  const dates = hist.map((h) => h.date)

  const y1 = values[values.length - 53] ?? values[0]
  const ret1y = y1 ? (totals.total - y1) / y1 : 0
  const cryptoPct = alloc.find((a) => a.cat === 'CRYPTO')?.pct ?? 0
  const cashSeg = alloc.find((a) => a.cat === 'CASH') ?? { pct: 0, value: 0 }

  const firstName = profileQ.data?.profile?.profile?.firstName || 'there'

  const stats = [
    { label: 'Today', value: mask(signedUSD(totals.day), privacy), sub: signedPct(totals.dayPct), color: totals.day >= 0 ? '#22E38A' : '#FF5470' },
    { label: '1-Yr Return', value: signedPct(ret1y), sub: 'trailing 12 months', color: ret1y >= 0 ? '#22E38A' : '#FF5470' },
    { label: 'Crypto Exposure', value: pct(cryptoPct), sub: 'of portfolio', color: '#FFB020' },
    { label: 'Cash Buffer', value: pct(cashSeg.pct), sub: mask(fmtCompact(cashSeg.value), privacy), color: '#35A0FF' },
  ]

  function openAdd() {
    setEditing(null)
    setModalOpen(true)
  }
  function openEdit(h: Holding) {
    setEditing(h)
    setModalOpen(true)
  }

  return (
    <>
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
          <button onClick={togglePrivacy} style={secondaryBtn}>
            {privacy ? 'Show' : 'Hide'} balances
          </button>
          <button onClick={openAdd} style={primaryBtn}>
            + Add holding
          </button>
        </div>
      </header>

      {/* AI daily briefing */}
      <InsightsPanel />

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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ ...panelTitle, margin: 0 }}>Allocation</div>
            <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.04)', padding: 3, borderRadius: 9 }}>
              {(['ticker', 'class'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => chooseAllocMode(m)}
                  style={{ padding: '4px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', background: allocMode === m ? 'rgba(34,227,138,0.16)' : 'transparent', color: allocMode === m ? '#22E38A' : '#8A90A2' }}
                >
                  {m === 'class' ? 'Class' : 'Ticker'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ flexShrink: 0 }}>
              <DonutChart slices={allocSlices} total={totals.total} privacy={privacy} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1, minWidth: 0, maxHeight: 168, overflowY: 'auto' }}>
              {allocSlices.map((a) => (
                <div key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, minWidth: 0 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, flexShrink: 0, background: a.color }} />
                  <span style={{ color: '#C9CDD8', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.label}
                  </span>
                  <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0 }}>{pct(a.pct)}</span>
                  <span style={{ color: '#8A90A2', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {mask(fmtCompact(a.value), privacy)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {allocMode === 'ticker' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12, color: '#8A90A2', cursor: 'pointer' }}>
              <input type="checkbox" checked={groupIdx} onChange={toggleGroupIdx} style={{ accentColor: '#22E38A', width: 14, height: 14 }} />
              Group index funds (S&amp;P 500, Nasdaq 100)
            </label>
          )}
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

      {/* Tax treatment breakdown */}
      {taxBreakdown.length > 0 && (
        <section style={panel}>
          <div style={panelTitle}>By tax treatment</div>
          <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
            {taxBreakdown.map((t) => (
              <div key={t.treatment} style={{ width: `${t.pct * 100}%`, background: t.color }} title={`${t.label} ${pct(t.pct)}`} />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${taxBreakdown.length}, 1fr)`, gap: 14, marginTop: 16 }}>
            {taxBreakdown.map((t) => (
              <div key={t.treatment} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: t.color, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#8A90A2', fontWeight: 600 }}>
                    {t.label} · {pct(t.pct)}
                  </div>
                  <div style={{ fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {mask(fmtUSD(t.value), privacy)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* By account / brokerage */}
      {brokerageBreakdown.length > 1 && (
        <section style={panel}>
          <div style={panelTitle}>By account / brokerage</div>
          <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
            {brokerageBreakdown.map((b) => (
              <div key={b.label} style={{ width: `${b.pct * 100}%`, background: b.color }} title={`${b.label} ${pct(b.pct)}`} />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginTop: 16 }}>
            {brokerageBreakdown.map((b) => (
              <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#8A90A2', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {b.label} · {pct(b.pct)}
                  </div>
                  <div style={{ fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {mask(fmtUSD(b.value), privacy)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Holdings */}
      <section style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ ...panelTitle, margin: 0 }}>Holdings</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={acctFilter} onChange={(e) => setAcctFilter(e.target.value as typeof acctFilter)} style={filterSelect}>
              <option value="ALL" style={filterOpt}>All accounts</option>
              <option value="PRE_TAX" style={filterOpt}>Pre-tax</option>
              <option value="ROTH" style={filterOpt}>Roth (tax-free)</option>
              <option value="TAXABLE" style={filterOpt}>Taxable</option>
            </select>
            {brokers.length > 0 && (
              <select value={brokerFilter} onChange={(e) => setBrokerFilter(e.target.value)} style={filterSelect}>
                <option value="ALL" style={filterOpt}>All brokerages</option>
                {brokers.map((b) => (
                  <option key={b} value={b} style={filterOpt}>{b}</option>
                ))}
              </select>
            )}
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} style={filterSelect}>
              <option value="value" style={filterOpt}>Sort: Value</option>
              <option value="day" style={filterOpt}>Sort: Day change</option>
              <option value="broker" style={filterOpt}>Sort: Brokerage</option>
              <option value="ticker" style={filterOpt}>Sort: Ticker</option>
            </select>
          </div>
        </div>
        {!isMobile && (
          <div style={{ ...holdingsGrid, padding: '0 4px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', fontSize: 11, letterSpacing: 0.6, color: '#8A90A2', fontWeight: 700, textTransform: 'uppercase' }}>
            <div>Asset</div>
            <div style={{ textAlign: 'right' }}>Price</div>
            <div style={{ textAlign: 'right' }}>24h</div>
            <div style={{ textAlign: 'right' }}>Holdings</div>
            <div style={{ textAlign: 'right' }}>Value / Alloc</div>
          </div>
        )}
        {totals.en.length === 0 ? (
          <div style={{ padding: '28px 4px', textAlign: 'center', color: '#8A90A2', fontSize: 13 }}>
            No holdings yet — hit “+ Add holding” to start.
          </div>
        ) : sortedRows.length === 0 ? (
          <div style={{ padding: '28px 4px', textAlign: 'center', color: '#8A90A2', fontSize: 13 }}>No holdings match this filter.</div>
        ) : null}
        {sortedRows.map((h) => {
          const shares = h.quantity === 1 || h.category === 'CASH' || h.category === 'OTHER' ? '—' : mask(`${h.quantity}`, privacy)
          const badge = (
            <span style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: catColor(h.category), color: '#04140C' }}>
              {h.symbol.slice(0, 4)}
            </span>
          )
          // Account-type tag on every holding (401(k), Roth IRA, Taxable, …);
          // tax-advantaged accounts get a purple accent, taxable stays muted.
          const acctAccent = h.accountType !== 'TAXABLE' && h.accountType !== 'OTHER'
          const acctTag = (
            <span
              style={{
                marginLeft: 6,
                fontSize: 10,
                fontWeight: 700,
                color: acctAccent ? '#9B7CFF' : '#8A90A2',
                background: acctAccent ? 'rgba(155,124,255,0.14)' : 'rgba(255,255,255,0.06)',
                borderRadius: 5,
                padding: '1px 5px',
                whiteSpace: 'nowrap',
              }}
            >
              {accountLabel(h.accountType)}
            </span>
          )
          const autoTag = h.autoAmount && h.autoFrequency && (
            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#22E38A', background: 'rgba(34,227,138,0.12)', borderRadius: 5, padding: '1px 5px', whiteSpace: 'nowrap' }}>
              ⟳ ${Math.round(h.autoAmount)}{autoFreqShort(h.autoFrequency)}
            </span>
          )
          const instTag = h.institution && (
            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: '#C9CDD8', background: 'rgba(255,255,255,0.06)', borderRadius: 5, padding: '1px 5px', whiteSpace: 'nowrap' }}>
              {h.institution}
            </span>
          )

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
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {h.symbol}
                      {acctTag}
                      {instTag}
                      {autoTag}
                    </div>
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
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {h.symbol}
                    {acctTag}
                    {instTag}
                    {autoTag}
                  </div>
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

      {modalOpen && (
        <HoldingModal
          editing={editing}
          existing={holdings}
          onClose={() => setModalOpen(false)}
          onSave={(p) => saveHolding.mutate(p)}
          onDelete={(h) => deleteHolding.mutate(h.id)}
        />
      )}
    </>
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
const filterSelect: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  padding: '5px 8px',
  color: '#C9CDD8',
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
}
const filterOpt: React.CSSProperties = { background: '#16181F' }
