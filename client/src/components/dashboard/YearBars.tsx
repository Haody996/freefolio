export interface BarSegment {
  value: number
  color: string
}
export interface BarDatum {
  age: number
  segments: BarSegment[]
}

// Stacked bar chart across ages. Used for retirement cash-flow (stacked income
// sources) and withdrawal-rate (single bars, with a 4% reference line).
export default function YearBars({
  data,
  yFormat,
  yMax,
  refLine,
  height = 240,
}: {
  data: BarDatum[]
  yFormat: (n: number) => string
  yMax?: number
  refLine?: { value: number; label: string }
  height?: number
}) {
  const W = 720
  const H = height
  const padL = 44
  const padR = 8
  const padT = 12
  const padB = 22
  const base = H - padB
  const plotW = W - padL - padR
  const plotH = base - padT

  if (data.length === 0) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A90A2', fontSize: 13 }}>No retirement years in range.</div>
  }

  const totals = data.map((d) => d.segments.reduce((s, x) => s + x.value, 0))
  const max = yMax ?? Math.max(0.0001, ...totals) * 1.1
  const y = (v: number) => padT + (1 - v / max) * plotH
  const n = data.length
  const slot = plotW / n
  const barW = Math.max(1.5, Math.min(16, slot * 0.62))

  const grid = [0, 1, 2, 3].map((i) => {
    const v = (i / 3) * max
    const yy = y(v)
    return (
      <g key={`g${i}`}>
        <line x1={padL} x2={W - padR} y1={yy} y2={yy} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
        <text x={padL - 6} y={yy + 4} textAnchor="end" fill="#8A90A2" fontSize={10}>
          {yFormat(v)}
        </text>
      </g>
    )
  })

  const bars = data.map((d, i) => {
    const cx = padL + i * slot + slot / 2
    let yCursor = base
    return (
      <g key={d.age}>
        {d.segments.map((seg, j) => {
          const h = (seg.value / max) * plotH
          yCursor -= h
          return h > 0.2 ? <rect key={j} x={cx - barW / 2} y={yCursor} width={barW} height={h} fill={seg.color} rx={1.5} /> : null
        })}
      </g>
    )
  })

  // x labels: ~6 evenly spaced ages
  const step = Math.max(1, Math.round(n / 6))
  const xLabels = data
    .map((d, i) => ({ d, i }))
    .filter(({ i }) => i % step === 0 || i === n - 1)
    .map(({ d, i }) => (
      <text key={d.age} x={padL + i * slot + slot / 2} y={H - 6} textAnchor="middle" fill="#8A90A2" fontSize={11}>
        {d.age}
      </text>
    ))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {grid}
      {refLine && (
        <g>
          <line x1={padL} x2={W - padR} y1={y(refLine.value)} y2={y(refLine.value)} stroke="#9B7CFF" strokeWidth={1.5} strokeDasharray="4 4" />
          <text x={W - padR} y={y(refLine.value) - 4} textAnchor="end" fill="#9B7CFF" fontSize={10} fontWeight={700}>
            {refLine.label}
          </text>
        </g>
      )}
      {bars}
      {xLabels}
    </svg>
  )
}
