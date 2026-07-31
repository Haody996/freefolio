import { fmtCompact, mask } from '../../lib/portfolio'
import type { AllocSlice } from '../../lib/portfolio'

export default function DonutChart({
  slices,
  total,
  privacy,
}: {
  slices: AllocSlice[]
  total: number
  privacy: boolean
}) {
  const sz = 190
  const cx = 95
  const cy = 95
  const r = 70
  const sw = 22
  const C = 2 * Math.PI * r
  let off = 0

  const segs = slices.map((s) => {
    const len = s.pct * C
    const el = (
      <circle
        key={s.key}
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={s.color}
        strokeWidth={sw}
        strokeDasharray={`${len} ${C - len}`}
        strokeDashoffset={-off}
      />
    )
    off += len
    return el
  })

  return (
    <svg viewBox={`0 0 ${sz} ${sz}`} width={140} height={140} style={{ display: 'block' }}>
      <g transform={`rotate(-90 ${cx} ${cy})`}>{segs}</g>
      <text x={cx} y={cy - 1} textAnchor="middle" fill="#F2F4F8" fontSize={22} fontWeight={700} fontFamily="'Space Grotesk'">
        {mask(fmtCompact(total), privacy)}
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" fill="#8A90A2" fontSize={10} letterSpacing={1.5}>
        NET WORTH
      </text>
    </svg>
  )
}
