import { useId } from 'react'
import { makeScale, linePath } from '../../lib/portfolio'
import type { Range } from './NetWorthPanel'

export default function NetWorthChart({
  values,
  dates,
  range,
}: {
  values: number[]
  dates: Date[]
  range: Range
}) {
  const gradId = useId()
  const W = 760
  const H = 260
  const padL = 6
  const padR = 6
  const padT = 16
  const padB = 26
  const base = H - padB

  if (values.length < 2) {
    return (
      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A90A2', fontSize: 13 }}>
        Not enough history yet — it accrues daily.
      </div>
    )
  }

  const sc = makeScale(values, W, H, padL, padR, padT, padB)
  const up = values[values.length - 1] >= values[0]
  const col = up ? '#22E38A' : '#FF5470'
  const area =
    linePath(values, sc.x, sc.y) +
    ` L${sc.x(values.length - 1).toFixed(1)} ${base} L${sc.x(0).toFixed(1)} ${base} Z`

  const grid = [0, 1, 2].map((i) => {
    const yy = padT + (i * (base - padT)) / 2
    return <line key={`g${i}`} x1={padL} x2={W - padR} y1={yy} y2={yy} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
  })

  const labels = [0, 1, 2, 3, 4].map((k) => {
    const idx = Math.round((k / 4) * (values.length - 1))
    const dd = dates[idx]
    const lbl =
      range === 'ALL'
        ? dd.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
        : dd.toLocaleDateString('en-US', { month: 'short', day: range === '1M' ? 'numeric' : undefined })
    return (
      <text
        key={`x${k}`}
        x={sc.x(idx)}
        y={H - 6}
        textAnchor={k === 0 ? 'start' : k === 4 ? 'end' : 'middle'}
        fill="#8A90A2"
        fontSize={11}
      >
        {lbl}
      </text>
    )
  })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity={0.3} />
          <stop offset="100%" stopColor={col} stopOpacity={0} />
        </linearGradient>
      </defs>
      {grid}
      <path d={area} fill={`url(#${gradId})`} />
      <path d={linePath(values, sc.x, sc.y)} fill="none" stroke={col} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={sc.x(values.length - 1)} cy={sc.y(values[values.length - 1])} r={4} fill={col} />
      {labels}
    </svg>
  )
}
