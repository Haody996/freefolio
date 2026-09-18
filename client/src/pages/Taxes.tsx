import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import api from '../lib/api'
import { useIsMobile } from '../lib/useIsMobile'
import Spinner from '../components/ui/Spinner'
import LineChart, { ChartLegend } from '../components/dashboard/LineChart'
import { fmtUSD, fmtCompact, signedUSD, accountLabel } from '../lib/portfolio'
import type { TaxInsights, TaxBucket, TaxClass, LocationFinding, FilingStatus } from '../lib/reports'
import Replacements from '../components/dashboard/Replacements'
import { panel, panelTitle, pageTitle, segmented, segmentedWrap, statTile, statLabel } from '../components/ui/styles'

const SEVERITY: Record<LocationFinding['severity'], { label: string; color: string }> = {
  high: { label: 'Big win', color: '#FF7A00' },
  medium: { label: 'Worth doing', color: '#FFB020' },
  low: { label: 'Minor', color: '#35A0FF' },
  info: { label: 'Good to know', color: '#8A90A2' },
  good: { label: 'Looks good', color: '#22E38A' },
}

const BUCKETS: { key: TaxBucket; label: string; sub: string }[] = [
  { key: 'TAXABLE', label: 'Taxable', sub: 'brokerage' },
  { key: 'DEFERRED', label: 'Tax-deferred', sub: 'traditional 401(k) / IRA' },
  { key: 'FREE', label: 'Tax-free', sub: 'Roth / HSA' },
]
const CLASS_LABEL: Record<TaxClass, string> = {
  BOND: 'Bonds',
  MUNI: 'Muni bonds',
  REIT: 'REITs',
  HIGH_YIELD: 'High-dividend',
  INTERNATIONAL: 'International',
  BROAD_INDEX: 'US index funds',
  GROWTH: 'Stocks / growth',
  COLLECTIBLE: 'Precious metals',
  CASH: 'Cash',
  OTHER: 'Other',
}

export default function Taxes() {
  const qc = useQueryClient()
  const isMobile = useIsMobile()
  const q = useQuery<TaxInsights>({ queryKey: ['tax-insights'], queryFn: async () => (await api.get('/tax-insights')).data })

  const setting = useMutation({
    mutationFn: async (patch: { filingStatus?: FilingStatus; rothTargetBracketPct?: number }) => (await api.put('/projection', patch)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tax-insights'] })
      qc.invalidateQueries({ queryKey: ['projection'] })
    },
  })

  const [explain, setExplain] = useState<{ text?: string; error?: string; loading?: boolean }>({})
  async function runExplain() {
    setExplain({ loading: true })
    try {
      const { data } = await api.post('/tax-insights/explain')
      setExplain({ text: data.text })
    } catch (err: any) {
      setExplain({ error: err?.response?.data?.error || 'The AI summary is unavailable right now.' })
    }
  }

  if (q.isLoading || !q.data) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {q.isError ? <span style={{ color: '#8A90A2' }}>Couldn't load tax insights.</span> : <Spinner />}
      </div>
    )
  }
  const t = q.data
  const ladder = t.rothLadder

  return (
    <>
      <header>
        <h1 style={pageTitle}>Taxes</h1>
        <div style={{ color: '#8A90A2', fontSize: 13, marginTop: 4 }}>Where to hold what, when to convert to Roth, and what to harvest. Estimates only — not tax advice.</div>
      </header>

      <section style={{ borderRadius: 18, padding: 22, background: 'linear-gradient(135deg, rgba(34,227,138,0.10), rgba(155,124,255,0.10))', border: '1px solid rgba(155,124,255,0.22)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Sparkles size={16} color="#9B7CFF" />
            <span style={{ fontFamily: "'Space Grotesk'", fontSize: 15, fontWeight: 700 }}>Your biggest tax opportunities</span>
          </div>
          {!explain.text && (
            <button onClick={runExplain} disabled={explain.loading} style={{ border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.06)', color: '#F2F4F8', borderRadius: 9, padding: '7px 12px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
              {explain.loading ? 'Summarizing…' : 'Summarize with AI'}
            </button>
          )}
        </div>
        {explain.text && <p style={{ margin: '12px 0 0', fontSize: 14.5, lineHeight: 1.6, color: '#E7EAF1' }}>{explain.text}</p>}
        {explain.error && <p style={{ margin: '12px 0 0', fontSize: 13, color: '#8A90A2' }}>{explain.error}</p>}
        {!explain.text && !explain.error && (
          <p style={{ margin: '10px 0 0', fontSize: 13, color: '#8A90A2' }}>A short, prioritized read of the analysis below, written by Gemini from these exact numbers.</p>
        )}
      </section>

      {/* Asset location */}
      <section style={panel}>
        <div style={panelTitle}>Asset location</div>
        <div style={{ fontSize: 13, color: '#8A90A2', marginBottom: 14, lineHeight: 1.5 }}>
          The same investments can cost less in tax depending on which account holds them: interest-paying funds in tax-deferred accounts, the highest growth in Roth, tax-efficient index funds in taxable.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {t.assetLocation.findings.length === 0 ? (
            <div style={{ fontSize: 13, color: '#8A90A2' }}>Add investments in more than one account type to see placement ideas.</div>
          ) : (
            t.assetLocation.findings.map((f) => (
              <div key={f.title} style={{ borderRadius: 12, padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderLeft: `3px solid ${SEVERITY[f.severity].color}` }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, color: SEVERITY[f.severity].color, textTransform: 'uppercase' }}>{SEVERITY[f.severity].label}</span>
                  <b style={{ fontSize: 14 }}>{f.title}</b>
                  {f.amount > 0 && <span style={{ fontSize: 12.5, color: '#8A90A2' }}>· up to {fmtUSD(f.amount)}</span>}
                </div>
                <div style={{ fontSize: 13, color: '#C9CDD8', marginTop: 5, lineHeight: 1.55 }}>{f.detail}</div>
              </div>
            ))
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12, marginTop: 16 }}>
          {BUCKETS.map((b) => {
            const rows = Object.entries(t.assetLocation.buckets[b.key]).sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0)) as [TaxClass, number][]
            const total = rows.reduce((s, [, v]) => s + v, 0)
            return (
              <div key={b.key} style={statTile}>
                <div style={statLabel}>{b.label}</div>
                <div style={{ fontSize: 11.5, color: '#5B6172', marginBottom: 8 }}>{b.sub}</div>
                {rows.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: '#8A90A2' }}>Nothing held here.</div>
                ) : (
                  rows.map(([c, v]) => (
                    <div key={c} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', fontVariantNumeric: 'tabular-nums' }}>
                      <span style={{ color: '#C9CDD8' }}>{CLASS_LABEL[c]}</span>
                      <span>
                        {fmtCompact(v)} <span style={{ color: '#5B6172' }}>{((v / total) * 100).toFixed(0)}%</span>
                      </span>
                    </div>
                  ))
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Roth conversion ladder */}
      <section style={panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ ...panelTitle, margin: 0 }}>Roth conversion ladder</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={segmentedWrap} role="group" aria-label="Filing status">
              {(['SINGLE', 'MARRIED_JOINT'] as const).map((f) => (
                <button key={f} onClick={() => setting.mutate({ filingStatus: f })} style={segmented(t.settings.filingStatus === f)}>
                  {f === 'SINGLE' ? 'Single' : 'Married, joint'}
                </button>
              ))}
            </div>
            <div style={segmentedWrap} role="group" aria-label="Fill up to bracket">
              {[10, 12, 22, 24, 32].map((b) => (
                <button key={b} onClick={() => setting.mutate({ rothTargetBracketPct: b })} style={segmented(t.settings.rothTargetBracketPct === b)} title={`Convert up to the top of the ${b}% bracket`}>
                  {b}%
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: '#8A90A2', marginBottom: 14, lineHeight: 1.5 }}>
          After you retire and before required minimum distributions (RMDs) start at 73, your taxable income is often low. Converting traditional 401(k)/IRA money to Roth each year — up to the top of a bracket you choose — pays tax at that low rate instead of a potentially higher one later.
        </div>
        {!ladder.applicable ? (
          <div style={{ fontSize: 13.5, color: '#C9CDD8' }}>{ladder.reason}</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12 }}>
              <Tile label={`Convert, ages ${ladder.startAge}–${ladder.endAge}`} value={fmtCompact(ladder.totalConverted)} sub={`up to the ${t.settings.rothTargetBracketPct}% bracket each year`} color="#22E38A" />
              <Tile label="Federal tax on conversions" value={fmtCompact(ladder.totalTax)} sub={`${(ladder.avgRate * 100).toFixed(1)}% average rate`} />
              <Tile label="RMD at 73" value={`${fmtCompact(ladder.rmdAt73.withoutLadder)} → ${fmtCompact(ladder.rmdAt73.withLadder)}`} sub={`${ladder.rmdAt73.bracketWithout}% → ${ladder.rmdAt73.bracketWith}% bracket`} color="#9B7CFF" />
              <Tile
                label="Penalty-free access"
                value={ladder.penaltyFreeFromAge ? `Age ${ladder.penaltyFreeFromAge}` : '59½+'}
                sub={ladder.penaltyFreeFromAge ? 'each conversion is usable 5 years later' : 'no early-access rules apply'}
              />
            </div>
            <div style={{ marginTop: 16 }}>
              <LineChart
                series={[
                  { key: 'no', label: 'Without conversions', color: '#8A90A2', values: ladder.years.map((y) => y.balanceNoLadder), dashed: true },
                  { key: 'yes', label: 'With the ladder', color: '#9B7CFF', values: ladder.years.map((y) => y.balance), area: true },
                ]}
                labels={ladder.years.map((y) => `Age ${y.age}`)}
                tickFormat={(i) => String(ladder.years[i]?.age ?? '')}
                yFormat={fmtCompact}
                zeroBased
                height={220}
              />
              <ChartLegend items={[{ color: '#9B7CFF', label: 'Traditional balance with the ladder' }, { color: '#8A90A2', label: 'Without conversions', dashed: true }]} />
            </div>
            <div style={{ marginTop: 14, maxHeight: 260, overflow: 'auto', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr style={{ color: '#8A90A2', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {['Age', 'Other income', 'Convert', 'Federal tax', 'Traditional left'].map((h, i) => (
                      <th key={h} style={{ padding: '7px 10px', textAlign: i ? 'right' : 'left', position: 'sticky', top: 0, background: '#16181F', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ladder.years.filter((_y, i) => i === 0 || ladder.years[i - 1].balance > 0.5).map((y) => (
                    <tr key={y.age} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '7px 10px' }}>{y.age}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#8A90A2' }}>{fmtUSD(y.otherIncome)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: y.conversion > 0 ? '#22E38A' : '#5B6172' }}>{fmtUSD(y.conversion)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#FF5470' }}>{fmtUSD(y.tax)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700 }}>{fmtUSD(y.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ladder.years.some((_y, i) => i > 0 && ladder.years[i - 1].balance <= 0.5) && (
              <div style={{ fontSize: 12.5, color: '#8A90A2', marginTop: 8 }}>
                Everything is converted by age {ladder.years.find((y) => y.balance <= 0.5)?.age} — nothing left for RMDs.
              </div>
            )}
            <div style={{ fontSize: 12, color: '#5B6172', marginTop: 10, lineHeight: 1.55 }}>
              Today's dollars with 2026 federal brackets (indexed to inflation). Assumes 85% of Social Security is taxable, no wages after retiring, and conversion taxes paid from other savings. Ignores state tax, ACA premium subsidies and Medicare IRMAA surcharges — conversions can raise both.
            </div>
          </>
        )}
      </section>

      {/* Harvesting with replacement funds */}
      <section style={panel}>
        <div style={panelTitle}>Tax-loss harvesting</div>
        {t.harvest.length === 0 ? (
          <div style={{ fontSize: 13, color: '#8A90A2' }}>
            No taxable positions are sitting on a meaningful loss right now. <Link to="/performance#harvest">See gains →</Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {t.harvest.map((h) => (
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
                <Replacements list={h.replacements} note={h.replacementNote} />
                {h.washSaleRisk && <div style={{ marginTop: 8, fontSize: 12, color: '#F2C879', lineHeight: 1.45 }}>⚠ {h.washSaleRisk}</div>}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

function Tile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={statTile}>
      <div style={statLabel}>{label}</div>
      <div style={{ fontFamily: "'Space Grotesk'", fontSize: 20, fontWeight: 700, margin: '7px 0 3px', color: color ?? '#F2F4F8', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#8A90A2' }}>{sub}</div>}
    </div>
  )
}
