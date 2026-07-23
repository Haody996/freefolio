import NetWorthChart from './NetWorthChart'
import { fmtUSD, signedUSD, signedPct, mask } from '../../lib/portfolio'

export type Range = '1M' | '3M' | '1Y' | 'ALL'
const RANGES: Range[] = ['1M', '3M', '1Y', 'ALL']
// Window by actual elapsed days — works whether history is daily or weekly.
const RANGE_DAYS: Record<Range, number> = { '1M': 31, '3M': 93, '1Y': 366, ALL: Infinity }

// Slice the series to the points within `range` of the most recent point,
// always keeping at least the last two points so the chart can draw.
function sliceRange(values: number[], dates: Date[], range: Range): { v: number[]; d: Date[] } {
  if (range === 'ALL' || values.length <= 2) return { v: values, d: dates }
  const end = dates[dates.length - 1]?.getTime() ?? Date.now()
  const cutoff = end - RANGE_DAYS[range] * 86400_000
  let from = dates.findIndex((dt) => dt.getTime() >= cutoff)
  if (from < 0) from = 0
  from = Math.min(from, values.length - 2) // guarantee ≥ 2 points
  return { v: values.slice(from), d: dates.slice(from) }
}

export default function NetWorthPanel({
  values,
  dates,
  total,
  day,
  dayPct,
  privacy,
  range,
  onRange,
  onSyncHistory,
  syncingHistory,
}: {
  values: number[]
  dates: Date[]
  total: number
  day: number
  dayPct: number
  privacy: boolean
  range: Range
  onRange: (r: Range) => void
  onSyncHistory?: () => void
  syncingHistory?: boolean
}) {
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
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
          <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 11 }}>
            {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => onRange(r)}
              style={{
                padding: '6px 14px',
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
        <NetWorthChart values={v} dates={d} range={range} />
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
