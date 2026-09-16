import { useEffect, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import api from '../lib/api'
import { useIsMobile } from '../lib/useIsMobile'
import Spinner from '../components/ui/Spinner'
import LineChart, { ChartLegend } from '../components/dashboard/LineChart'
import { fmtUSD, signedUSD, signedPct, pct, accountLabel, accountTreatment } from '../lib/portfolio'
import type { GainsReport, PerformanceReport, Period, HoldingGains } from '../lib/reports'
import { panel, panelTitle, pageTitle, statTile, statLabel, statValue, segmented, segmentedWrap } from '../components/ui/styles'

const PERIOD_LABEL: Record<Period, string> = { '1M': '1 month', '3M': '3 months', YTD: 'Year to date', '1Y': '1 year' }

function tone(n: number | null | undefined): string {
  if (n == null) return '#8A90A2'
  return n >= 0 ? '#22E38A' : '#FF5470'
}

function fmtDay(iso: string, withYear = false): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: withYear ? 'numeric' : undefined })
}

const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'right', fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: '#8A90A2', fontWeight: 700, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '10px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', borderTop: '1px solid rgba(255,255,255,0.05)' }

export default function Performance() {
  const isMobile = useIsMobile()
  const location = useLocation()
  const [benchmark, setBenchmark] = useState(() => localStorage.getItem('ff_benchmark') || 'SPY')
  const [period, setPeriod] = useState<Period>('1Y')

  const perfQ = useQuery<PerformanceReport>({
    queryKey: ['performance', benchmark],
    queryFn: async () => (await api.get('/performance', { params: { benchmark } })).data,
    staleTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
    retry: 0,
  })
  const gainsQ = useQuery<GainsReport>({
    queryKey: ['gains'],
    queryFn: async () => (await api.get('/gains')).data,
  })

  // Jump to the harvesting section when linked from the dashboard.
  useEffect(() => {
    if (location.hash === '#harvest' && gainsQ.data) document.getElementById('harvest')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [location.hash, gainsQ.data])

  function chooseBenchmark(b: string) {
    localStorage.setItem('ff_benchmark', b)
    setBenchmark(b)
  }

  const perf = perfQ.data
  const gains = gainsQ.data
  const sel = perf?.periods.find((p) => p.period === period)

  // Chart: cumulative return since the selected period's start, both rebased to 0%.
  const startIdx = perf && sel ? Math.max(0, perf.series.findIndex((p) => p.date >= sel.startDate) - (perf.series.some((p) => p.date === sel.startDate) ? 0 : 1)) : 0
  const win = perf ? perf.series.slice(startIdx) : []
  const p0 = win[0]?.portfolio
  const b0 = win.find((p) => p.benchmark != null)?.benchmark ?? null
  const portfolioLine = win.map((p) => (p0 ? p.portfolio / p0 - 1 : null))
  const benchLine = win.map((p) => (b0 != null && p.benchmark != null ? p.benchmark / b0 - 1 : null))

  const benchLabel = perf?.benchmarks.find((b) => b.symbol === benchmark)?.label ?? benchmark
  const vsBench = sel?.twr != null && sel.benchmark != null ? sel.twr - sel.benchmark : null

  return (
    <>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={pageTitle}>Performance</h1>
          <div style={{ color: '#8A90A2', fontSize: 13, marginTop: 4 }}>How your investments actually did — contributions don't count as growth.</div>
        </div>
        <div style={segmentedWrap} role="group" aria-label="Benchmark">
          {(perf?.benchmarks ?? [{ symbol: 'SPY', label: '' }, { symbol: 'VTI', label: '' }, { symbol: 'QQQ', label: '' }, { symbol: 'VT', label: '' }]).map((b) => (
            <button key={b.symbol} onClick={() => chooseBenchmark(b.symbol)} style={segmented(benchmark === b.symbol)} title={b.label}>
              vs {b.symbol}
            </button>
          ))}
        </div>
      </header>

      {/* Returns */}
      <section style={panel}>
        {perfQ.isLoading ? (
          <div style={{ minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spinner />
          </div>
        ) : perfQ.isError || !perf ? (
          <div style={{ color: '#8A90A2', fontSize: 13 }}>Performance data is unavailable right now — market data providers may be rate limiting. Try again shortly.</div>
        ) : perf.periods.length === 0 ? (
          <div style={{ color: '#8A90A2', fontSize: 13, padding: '20px 0' }}>
            Add market-priced holdings (stocks, ETFs, crypto, metals) to see your returns. <Link to="/">Go to dashboard →</Link>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
              {perf.periods.map((p) => {
                const active = p.period === period
                return (
                  <button
                    key={p.period}
                    onClick={() => setPeriod(p.period)}
                    aria-pressed={active}
                    style={{ ...statTile, textAlign: 'left', border: `1px solid ${active ? 'rgba(34,227,138,0.45)' : 'transparent'}`, background: active ? 'rgba(34,227,138,0.07)' : statTile.background, cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}
                  >
                    <div style={statLabel}>{PERIOD_LABEL[p.period]}</div>
                    <div style={{ ...statValue, color: tone(p.twr) }}>{p.twr == null ? '—' : signedPct(p.twr)}</div>
                    <div style={{ fontSize: 12, color: '#8A90A2' }}>
                      {benchmark} {p.benchmark == null ? '—' : <span style={{ color: tone(p.benchmark) }}>{signedPct(p.benchmark)}</span>}
                    </div>
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <div style={{ fontFamily: "'Space Grotesk'", fontSize: 16, fontWeight: 600 }}>Cumulative return · {PERIOD_LABEL[period].toLowerCase()}</div>
              {vsBench != null && (
                <div style={{ fontSize: 13, color: '#C9CDD8' }}>
                  You {vsBench >= 0 ? 'beat' : 'trailed'} {benchmark} by <b style={{ color: tone(vsBench) }}>{Math.abs(vsBench * 100).toFixed(2)} pts</b>
                </div>
              )}
            </div>
            <LineChart
              series={[
                { key: 'p', label: 'Your investments', color: '#22E38A', values: portfolioLine, area: true },
                { key: 'b', label: benchLabel, color: '#9B7CFF', values: benchLine, dashed: true },
              ]}
              labels={win.map((p) => fmtDay(p.date, true))}
              tickFormat={(i) => (win[i] ? fmtDay(win[i].date, period === '1Y') : '')}
              yFormat={(v) => signedPct(v).replace('.00%', '%')}
              refLines={[]}
            />
            <ChartLegend items={[{ color: '#22E38A', label: 'Your investments (time-weighted)' }, { color: '#9B7CFF', label: benchLabel, dashed: true }]} />

            {sel && (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: 12, marginTop: 18 }}>
                <MiniStat label="Time-weighted" value={sel.twr == null ? '—' : signedPct(sel.twr)} color={tone(sel.twr)} hint="Pure investment return — ignores when you added money. Compare this to the benchmark." />
                <MiniStat label="Money-weighted" value={sel.mwr == null ? '—' : signedPct(sel.mwr)} color={tone(sel.mwr)} hint="Your personal return (XIRR) — rewards or penalizes the timing of your buys and sells." />
                <MiniStat label="Start value" value={fmtUSD(sel.startValue)} hint={`Invested holdings on ${fmtDay(sel.startDate, true)}`} />
                <MiniStat label="Net contributions" value={signedUSD(sel.netContributions)} color="#35A0FF" hint="Logged buys minus sells (incl. auto-invest)" />
                <MiniStat label="Investment gain" value={signedUSD(sel.gain)} color={tone(sel.gain)} hint="End − start − contributions" />
              </div>
            )}

            <div style={{ marginTop: 16, fontSize: 12, color: '#8A90A2', lineHeight: 1.55 }}>
              Includes dividends (adjusted prices) for {perf.included} market-priced holding{perf.included === 1 ? '' : 's'}; cash, property and manual assets are excluded.
              Past share counts come from your logged buys and sells — shares added without a transaction are assumed held for the whole period.
              {perf.excluded.length > 0 && <> No price history for {perf.excluded.join(', ')}, so {perf.excluded.length === 1 ? 'it is' : 'they are'} left out.</>}
            </div>
          </>
        )}
      </section>

      {gainsQ.isLoading ? (
        <div style={{ ...panel, display: 'flex', justifyContent: 'center' }}>
          <Spinner />
        </div>
      ) : gains ? (
        <GainsSections gains={gains} isMobile={isMobile} />
      ) : (
        <div style={{ ...panel, color: '#8A90A2', fontSize: 13 }}>Gains are unavailable right now.</div>
      )}
    </>
  )
}

function MiniStat({ label, value, color, hint }: { label: string; value: string; color?: string; hint?: string }) {
  return (
    <div style={{ ...statTile, padding: 14 }} title={hint}>
      <div style={{ ...statLabel, fontSize: 10.5 }}>{label}</div>
      <div style={{ fontFamily: "'Space Grotesk'", fontSize: 19, fontWeight: 700, marginTop: 5, color: color ?? '#F2F4F8', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {hint && <div style={{ fontSize: 11.5, color: '#8A90A2', marginTop: 3, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  )
}

function GainsSections({ gains, isMobile }: { gains: GainsReport; isMobile: boolean }) {
  const [showAllSales, setShowAllSales] = useState(false)
  const known = gains.holdings.filter((h) => h.unrealized != null)
  const missing = gains.holdings.filter((h) => h.basisStatus !== 'FULL' && h.quantity > 0)
  const totalUnrealized = known.reduce((s, h) => s + (h.unrealized ?? 0), 0)
  const totalBasis = known.reduce((s, h) => s + h.costBasis, 0)
  const st = known.reduce((s, h) => s + h.shortTermUnrealized, 0)
  const lt = known.reduce((s, h) => s + h.longTermUnrealized, 0)

  // Unrealized by account (account type + institution).
  const byAccount = new Map<string, { label: string; value: number; basis: number; gain: number; hasBasis: boolean }>()
  for (const h of gains.holdings) {
    const key = `${h.accountType}|${h.institution}`
    const row = byAccount.get(key) ?? { label: accountLabel(h.accountType) + (h.institution ? ` · ${h.institution}` : ''), value: 0, basis: 0, gain: 0, hasBasis: false }
    row.value += h.value
    if (h.unrealized != null) {
      row.basis += h.costBasis
      row.gain += h.unrealized
      row.hasBasis = true
    }
    byAccount.set(key, row)
  }
  const accounts = [...byAccount.values()].filter((a) => a.value > 0).sort((a, b) => b.value - a.value)

  // Realized gains by tax year, taxable accounts only.
  const taxableSales = gains.realized.filter((r) => accountTreatment(r.accountType) === 'TAXABLE')
  const byYear = new Map<string, { st: number; lt: number; unknown: number; proceeds: number; noBasis: number }>()
  for (const r of taxableSales) {
    const y = r.date.slice(0, 4)
    const row = byYear.get(y) ?? { st: 0, lt: 0, unknown: 0, proceeds: 0, noBasis: 0 }
    row.proceeds += r.proceeds
    if (r.gain == null) row.noBasis += r.proceeds
    else if (r.term === 'SHORT') row.st += r.gain
    else if (r.term === 'LONG') row.lt += r.gain
    else row.unknown += r.gain
    byYear.set(y, row)
  }
  const years = [...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  const hasUnknownTerm = years.some(([, r]) => r.unknown !== 0)
  const sales = showAllSales ? gains.realized : gains.realized.slice(0, 8)

  return (
    <>
      <section style={panel}>
        <div style={panelTitle}>Unrealized gains</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12 }}>
          <div style={statTile}>
            <div style={statLabel}>Total gain</div>
            <div style={{ ...statValue, color: tone(totalUnrealized) }}>{signedUSD(totalUnrealized)}</div>
            <div style={{ fontSize: 12, color: '#8A90A2' }}>{totalBasis ? signedPct(totalUnrealized / totalBasis) : '—'} on {fmtUSD(totalBasis)} cost</div>
          </div>
          <div style={statTile}>
            <div style={statLabel}>Short-term</div>
            <div style={{ ...statValue, color: tone(st) }}>{signedUSD(st)}</div>
            <div style={{ fontSize: 12, color: '#8A90A2' }}>held 1 year or less</div>
          </div>
          <div style={statTile}>
            <div style={statLabel}>Long-term</div>
            <div style={{ ...statValue, color: tone(lt) }}>{signedUSD(lt)}</div>
            <div style={{ fontSize: 12, color: '#8A90A2' }}>held over 1 year</div>
          </div>
          <div style={statTile}>
            <div style={statLabel}>Missing cost basis</div>
            <div style={{ ...statValue, color: missing.length ? '#FFB020' : '#22E38A' }}>{missing.length}</div>
            <div style={{ fontSize: 12, color: '#8A90A2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={missing.map((m) => m.symbol).join(', ')}>
              {missing.length ? missing.map((m) => m.symbol).slice(0, 4).join(', ') + (missing.length > 4 ? '…' : '') : 'all positions covered'}
            </div>
          </div>
        </div>
        {missing.length > 0 && (
          <div style={{ fontSize: 12.5, color: '#8A90A2', marginTop: 12 }}>
            Add an average cost to those holdings on the <Link to="/">dashboard</Link> (click a holding) to include them.
          </div>
        )}

        <div style={{ ...panelTitle, fontSize: 14, marginTop: 22, marginBottom: 8, color: '#C9CDD8' }}>By account</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Account</th>
                <th style={th}>Value</th>
                <th style={th}>Cost basis</th>
                <th style={th}>Gain</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.label}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{a.label}</td>
                  <td style={td}>{fmtUSD(a.value)}</td>
                  <td style={{ ...td, color: '#C9CDD8' }}>{a.hasBasis ? fmtUSD(a.basis) : '—'}</td>
                  <td style={{ ...td, color: a.hasBasis ? tone(a.gain) : '#8A90A2', fontWeight: 600 }}>
                    {a.hasBasis ? `${signedUSD(a.gain)} (${a.basis ? signedPct(a.gain / a.basis) : '—'})` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ ...panelTitle, fontSize: 14, marginTop: 22, marginBottom: 8, color: '#C9CDD8' }}>By holding</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Holding</th>
                <th style={th}>Avg cost</th>
                <th style={th}>Price</th>
                <th style={th}>Value</th>
                <th style={th}>Gain</th>
                <th style={th}>Short / long</th>
              </tr>
            </thead>
            <tbody>
              {[...gains.holdings]
                .filter((h) => h.quantity > 0)
                .sort((a, b) => (b.unrealized ?? -Infinity) - (a.unrealized ?? -Infinity))
                .map((h) => (
                  <HoldingRow key={h.holdingId} h={h} />
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={panel}>
        <div style={panelTitle}>Realized gains · taxable accounts</div>
        {years.length === 0 ? (
          <div style={{ fontSize: 13, color: '#8A90A2' }}>No sales logged in taxable accounts yet. Use “Buy / Sell” on a holding to record sales — gains are matched to your oldest shares first (FIFO).</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Tax year</th>
                  <th style={th}>Proceeds</th>
                  <th style={th}>Short-term</th>
                  <th style={th}>Long-term</th>
                  {hasUnknownTerm && <th style={th}>Unknown term</th>}
                  <th style={th}>Net</th>
                </tr>
              </thead>
              <tbody>
                {years.map(([y, r]) => {
                  const net = r.st + r.lt + r.unknown
                  return (
                    <tr key={y}>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{y}</td>
                      <td style={td}>{fmtUSD(r.proceeds)}</td>
                      <td style={{ ...td, color: tone(r.st) }}>{signedUSD(r.st)}</td>
                      <td style={{ ...td, color: tone(r.lt) }}>{signedUSD(r.lt)}</td>
                      {hasUnknownTerm && <td style={{ ...td, color: tone(r.unknown) }}>{signedUSD(r.unknown)}</td>}
                      <td style={{ ...td, color: tone(net), fontWeight: 700 }}>
                        {signedUSD(net)}
                        {r.noBasis > 0 && <div style={{ fontSize: 11, color: '#FFB020', fontWeight: 500 }}>+ {fmtUSD(r.noBasis)} proceeds w/o basis</div>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {gains.realized.length > 0 && (
          <>
            <div style={{ ...panelTitle, fontSize: 14, marginTop: 22, marginBottom: 8, color: '#C9CDD8' }}>Sales</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {sales.map((r, i) => (
                <div key={`${r.holdingId}-${r.date}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 13, fontVariantNumeric: 'tabular-nums', flexWrap: 'wrap' }}>
                  <span style={{ color: '#8A90A2', width: 92 }}>{fmtDay(r.date, true)}</span>
                  <b style={{ minWidth: 60 }}>{r.symbol}</b>
                  <span style={{ color: '#8A90A2', flex: 1, minWidth: 120 }}>
                    {r.qty.toLocaleString('en-US', { maximumFractionDigits: 6 })} for {fmtUSD(r.proceeds)} · {accountLabel(r.accountType)}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#8A90A2' }}>{r.term === 'SHORT' ? 'SHORT' : r.term === 'LONG' ? 'LONG' : '—'}</span>
                  <b style={{ color: tone(r.gain), minWidth: 90, textAlign: 'right' }}>{r.gain == null ? 'no basis' : signedUSD(r.gain)}</b>
                </div>
              ))}
            </div>
            {gains.realized.length > 8 && (
              <button onClick={() => setShowAllSales((v) => !v)} style={{ marginTop: 8, border: 'none', background: 'transparent', color: '#22E38A', fontWeight: 700, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', padding: 0 }}>
                {showAllSales ? 'Show fewer' : `Show all ${gains.realized.length} sales`}
              </button>
            )}
          </>
        )}
      </section>

      <section id="harvest" style={{ ...panel, scrollMarginTop: 20 }}>
        <div style={panelTitle}>Tax-loss harvesting</div>
        {gains.harvest.length === 0 ? (
          <div style={{ fontSize: 13, color: '#8A90A2' }}>No taxable positions are sitting on a meaningful loss (at least $100 and 5%) right now.</div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: '#C9CDD8', marginBottom: 14, lineHeight: 1.55 }}>
              Selling these realizes a loss that can offset capital gains, plus up to $3,000 a year of ordinary income. Total harvestable:{' '}
              <b style={{ color: '#FF5470' }}>{fmtUSD(Math.abs(gains.harvest.reduce((s, h) => s + h.harvestableLoss, 0)))}</b>.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
              {gains.harvest.map((h) => (
                <div key={h.holdingId} style={{ ...statTile, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <div>
                      <b style={{ fontSize: 15 }}>{h.symbol}</b>{' '}
                      <span style={{ fontSize: 12, color: '#8A90A2' }}>
                        {accountLabel(h.accountType)}
                        {h.institution ? ` · ${h.institution}` : ''}
                      </span>
                    </div>
                    <b style={{ fontFamily: "'Space Grotesk'", fontSize: 18, color: '#FF5470' }}>{signedUSD(h.harvestableLoss)}</b>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#8A90A2', marginTop: 4 }}>
                    {h.qtyAtLoss.toLocaleString('en-US', { maximumFractionDigits: 6 })} {h.category === 'METALS' ? 'oz' : h.category === 'CRYPTO' ? 'units' : 'shares'} at a loss ({pct(Math.abs(h.lossPct))} below cost)
                    {h.shortTermLoss !== 0 && h.longTermLoss !== 0 && ` · ${signedUSD(h.shortTermLoss)} short-term, ${signedUSD(h.longTermLoss)} long-term`}
                    {h.shortTermLoss !== 0 && h.longTermLoss === 0 && ' · short-term'}
                    {h.longTermLoss !== 0 && h.shortTermLoss === 0 && ' · long-term'}
                  </div>
                  {h.washSaleRisk && (
                    <div style={{ marginTop: 10, fontSize: 12, color: '#F2C879', background: 'rgba(255,176,32,0.08)', border: '1px solid rgba(255,176,32,0.25)', borderRadius: 8, padding: '7px 9px', lineHeight: 1.45 }}>
                      ⚠ {h.washSaleRisk}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: '#8A90A2', marginTop: 14, lineHeight: 1.55 }}>
              Wash-sale rule: buying the same or a substantially identical security within 30 days before or after the sale — in any account, including IRAs — disallows the loss.
              To stay invested, swap into a similar but not identical fund. Estimates only, not tax advice.
            </div>
          </>
        )}
      </section>
    </>
  )
}

function HoldingRow({ h }: { h: HoldingGains }) {
  const unit = h.category === 'METALS' ? ' /oz' : ''
  return (
    <tr>
      <td style={{ ...td, textAlign: 'left' }}>
        <b>{h.symbol}</b>{' '}
        <span style={{ fontSize: 12, color: '#8A90A2' }}>
          {accountLabel(h.accountType)}
          {h.institution ? ` · ${h.institution}` : ''}
        </span>
        {h.basisStatus === 'PARTIAL' && <div style={{ fontSize: 11, color: '#FFB020' }}>cost known for {h.knownQty.toLocaleString('en-US', { maximumFractionDigits: 6 })} of {h.quantity.toLocaleString('en-US', { maximumFractionDigits: 6 })}</div>}
      </td>
      <td style={{ ...td, color: '#C9CDD8' }}>{h.avgCost != null ? fmtUSD(h.avgCost, h.avgCost < 1 ? 6 : 2) + unit : '—'}</td>
      <td style={{ ...td, color: '#C9CDD8' }}>{fmtUSD(h.price, h.price < 1 ? 6 : 2)}</td>
      <td style={td}>{fmtUSD(h.value)}</td>
      <td style={{ ...td, color: tone(h.unrealized), fontWeight: 600 }}>
        {h.unrealized == null ? <span style={{ color: '#5B6172', fontWeight: 400 }}>add cost</span> : `${signedUSD(h.unrealized)} (${h.unrealizedPct != null ? signedPct(h.unrealizedPct) : '—'})`}
      </td>
      <td style={{ ...td, fontSize: 12, color: '#8A90A2' }}>
        {h.unrealized == null ? '—' : (
          <>
            <span style={{ color: tone(h.shortTermUnrealized) }}>{signedUSD(h.shortTermUnrealized)}</span> / <span style={{ color: tone(h.longTermUnrealized) }}>{signedUSD(h.longTermUnrealized)}</span>
          </>
        )}
      </td>
    </tr>
  )
}
