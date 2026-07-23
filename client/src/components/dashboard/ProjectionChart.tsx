import { useId } from 'react'
import { makeScale, linePath, fmtCompact } from '../../lib/portfolio'
import type { ProjectionResult } from '../../lib/portfolio'

export default function ProjectionChart({ p }: { p: ProjectionResult }) {
  const gradId = useId()
  const W = 680
  const H = 270
  const padL = 6
  const padR = 46
  const padT = 16
  const padB = 24
  const base = H - padB

  const sc = makeScale(p.nominal, W, H, padL, padR, padT, padB, 0)
  const area =
    linePath(p.nominal, sc.x, sc.y) +
    ` L${sc.x(p.nominal.length - 1).toFixed(1)} ${base} L${sc.x(0).toFixed(1)} ${base} Z`

  const grid = [0, 1, 2, 3].map((i) => {
    const val = sc.mn + (i / 3) * (sc.mx - sc.mn)
    const yy = sc.y(val)
    return (
      <g key={`g${i}`}>
        <line x1={padL} x2={W - padR} y1={yy} y2={yy} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
        <text x={W - padR + 6} y={yy + 4} fill="#8A90A2" fontSize={10}>
          {fmtCompact(val)}
        </text>
      </g>
    )
  })

  const ticks = [0, Math.round(p.years * 0.25), Math.round(p.years * 0.5), Math.round(p.years * 0.75), p.years]
  const xLabels = ticks.map((tk, k) => (
    <text
      key={`x${k}`}
      x={sc.x(tk)}
      y={H - 4}
      textAnchor={k === 0 ? 'start' : k === ticks.length - 1 ? 'end' : 'middle'}
      fill="#8A90A2"
      fontSize={11}
    >
      {tk}y
    </text>
  ))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22E38A" stopOpacity={0.26} />
          <stop offset="100%" stopColor="#22E38A" stopOpacity={0} />
        </linearGradient>
      </defs>
      {grid}
      <path d={area} fill={`url(#${gradId})`} />
      <path d={linePath(p.contributed, sc.x, sc.y)} fill="none" stroke="#5B6172" strokeWidth={1.5} strokeDasharray="4 4" />
      <path d={linePath(p.real, sc.x, sc.y)} fill="none" stroke="#9B7CFF" strokeWidth={2} strokeDasharray="2 3" />
      <path d={linePath(p.nominal, sc.x, sc.y)} fill="none" stroke="#22E38A" strokeWidth={2.5} strokeLinejoin="round" />
      {xLabels}
    </svg>
  )
}
