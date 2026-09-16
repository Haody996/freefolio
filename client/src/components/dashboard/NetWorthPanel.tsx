import NetWorthChart from './NetWorthChart'
import { useIsMobile } from '../../lib/useIsMobile'
import { Link } from 'react-router-dom'
import { fmtUSD, fmtCompact, signedUSD, signedPct, mask } from '../../lib/portfolio'

export type Range = '1D' | '1M' | '3M' | 'YTD' | '1Y' | 'ALL'
const RANGES: Range[] = ['1D', '1M', '3M', 'YTD', '1Y', 'ALL']
// Window by actual elapsed days — works whether history is daily or weekly.
const RANGE_DAYS: Record<Range, number> = { '1D': 1, '1M': 31, '3M': 93, YTD: 0, '1Y': 366, ALL: Infinity }

// Slice the series to the points within `range` of the most recent point,
// always keeping at least the last two points so the chart can draw.
function sliceRange(values: number[], dates: Date[], range: Range): { v: number[]; d: Date[] } {
  // 1D arrives as its own intraday series, already windowed.
  if (range === 'ALL' || range === '1D' || values.length <= 2) return { v: values, d: dates }
  const end = dates[dates.length - 1]?.getTime() ?? Date.now()
  const cutoff = range === 'YTD' ? new Date(new Date().getFullYear(), 0, 1).getTime() : end - RANGE_DAYS[range] * 86400_000
  let from = dates.findIndex((dt) => dt.getTime() >= cutoff)
  if (from < 0) from = 0
  from = Math.min(from, values.length - 2) // guarantee ≥ 2 points
  return { v: values.slice(from), d: dates.slice(from) }
}

export default function NetWorthPanel({
  values,
  dates,
  total,
  assets,
  debts,
  day,
  dayPct,
  privacy,
  range,
  onRange,
  onSyncHistory,
  syncingHistory,
  chartStatus,
}: {
  values: number[]
  dates: Date[]
  total: number
  assets?: number // shown with debts when the user has any
  debts?: number
  day: number
  dayPct: number
  privacy: boolean
  range: Range
  onRange: (r: Range) => void
  onSyncHistory?: () => void
  syncingHistory?: boolean
  chartStatus?: 'loading' | 'error' // for the intraday (1D) series
}) {
  const isMobile = useIsMobile()
  const { v, d } = sliceRange(values, dates, range)
  const dayColor = day >= 0 ? '#22E38A' : '#FF5470'

  return (
    <section style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.2, color: '#8A90A2', fontWeight: 700 }}>TOTAL NET WORTH</div>
          <div
            style={{
              fontFamily: "'Space Grotesk'",
              fontSize: 42,
              fontWeight: 700,
              letterSpacing: -1,
              lineHeight: 1.1,
              margin: '6px 0 4px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {mask(fmtUSD(total), privacy)}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: dayColor, fontVariantNumeric: 'tabular-nums' }}>
            {mask(`${signedUSD(day)}  (${signedPct(dayPct)})`, privacy)}{' '}
            <span style={{ color: '#8A90A2', fontWeight: 500 }}>today</span>
          </div>
          {assets != null && debts != null && (
            <div style={{ fontSize: 12.5, color: '#8A90A2', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
              Assets <b style={{ color: '#C9CDD8' }}>{mask(fmtCompact(assets), privacy)}</b> ·{' '}
              <Link to="/debts" style={{ color: '#8A90A2' }}>
                Debts <b style={{ color: '#FF5470' }}>{mask('−' + fmtCompact(debts), privacy)}</b>
              </Link>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, flexWrap: 'wrap', width: isMobile ? '100%' : undefined }}>
          {onSyncHistory && (
            <button
              onClick={onSyncHistory}
              disabled={syncingHistory}
              title="Rebuild history from real market data"
              style={{
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.05)',
                color: syncingHistory ? '#5B6172' : '#8A90A2',
                borderRadius: 10,
                padding: '7px 12px',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: syncingHistory ? 'default' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {syncingHistory ? 'Syncing…' : '↻ Real history'}
            </button>
          )}
          <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 11, flex: isMobile ? '1 1 100%' : undefined }}>
            {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => onRange(r)}
              style={{
                padding: isMobile ? '6px 0' : '6px 14px',
                flex: isMobile ? 1 : undefined,
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'inherit',
                background: range === r ? 'rgba(34,227,138,0.16)' : 'transparent',
                color: range === r ? '#22E38A' : '#8A90A2',
              }}
            >
              {r}
            </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        {chartStatus ? (
          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A90A2', fontSize: 13 }}>
            {chartStatus === 'loading' ? 'Loading today’s prices…' : 'Intraday prices are unavailable right now — try again in a few minutes.'}
          </div>
        ) : (
          <NetWorthChart values={v} dates={d} range={range} />
        )}
      </div>
    </section>
  )
}

const panel: React.CSSProperties = {
  background: '#16181F',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 18,
  padding: 24,
}
