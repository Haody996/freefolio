import { useId, useRef, useState } from 'react'
import { makeScale, linePath, fmtCompact, fmtUSD } from '../../lib/portfolio'
import type { RetirementResult } from '../../lib/retirement'

const W = 720
const H = 300
const padL = 6
const padR = 48
const padT = 16
const padB = 26
const base = H - padB

// Portfolio balance across ages: accumulation then drawdown, with a marker at
// the retirement age, a shaded drawdown region, and a hover readout (age + $).
export default function RetirementChart({
  result,
  retirementAge,
}: {
  result: RetirementResult
  retirementAge: number
}) {
  const gradId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const series = result.series
  const balances = series.map((s) => s.balance)
  const ages = series.map((s) => s.age)
  if (balances.length < 2) return null

  const sc = makeScale(balances, W, H, padL, padR, padT, padB, 0)
  const col = result.lasts ? '#22E38A' : '#FFB020'
  const area = linePath(balances, sc.x, sc.y) + ` L${sc.x(balances.length - 1).toFixed(1)} ${base} L${sc.x(0).toFixed(1)} ${base} Z`

  const retIdx = ages.findIndex((a) => a >= retirementAge)
  const depIdx = result.depletedAge != null ? ages.findIndex((a) => a >= result.depletedAge!) : -1

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const vbx = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round(((vbx - padL) / (W - padL - padR)) * (balances.length - 1))
    setHover(Math.max(0, Math.min(balances.length - 1, i)))
  }

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

  const xLabels = [0, 0.25, 0.5, 0.75, 1].map((f, k) => {
    const idx = Math.round(f * (balances.length - 1))
    return (
      <text key={`x${k}`} x={sc.x(idx)} y={H - 6} textAnchor={k === 0 ? 'start' : k === 4 ? 'end' : 'middle'} fill="#8A90A2" fontSize={11}>
        {ages[idx]}
      </text>
    )
  })

  return (
    <div ref={wrapRef} style={{ position: 'relative' }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity={0.28} />
            <stop offset="100%" stopColor={col} stopOpacity={0} />
          </linearGradient>
        </defs>

        {retIdx > 0 && <rect x={sc.x(retIdx)} y={padT} width={W - padR - sc.x(retIdx)} height={base - padT} fill="rgba(255,255,255,0.03)" />}

        {grid}

        <path d={area} fill={`url(#${gradId})`} />
        <path d={linePath(balances, sc.x, sc.y)} fill="none" stroke={col} strokeWidth={2.5} strokeLinejoin="round" />

        {/* Retirement marker */}
        {retIdx >= 0 && (
          <>
            <line x1={sc.x(retIdx)} x2={sc.x(retIdx)} y1={padT} y2={base} stroke="#9B7CFF" strokeWidth={1.5} strokeDasharray="4 4" />
            <circle cx={sc.x(retIdx)} cy={sc.y(balances[retIdx])} r={4} fill="#9B7CFF" />
            <text x={sc.x(retIdx) + 6} y={padT + 12} fill="#9B7CFF" fontSize={11} fontWeight={700}>
              Retire {retirementAge}
            </text>
          </>
        )}

        {/* Depletion marker */}
        {depIdx > 0 && (
          <>
            <line x1={sc.x(depIdx)} x2={sc.x(depIdx)} y1={padT} y2={base} stroke="#FF5470" strokeWidth={1.5} />
            <text x={sc.x(depIdx) - 6} y={padT + 12} textAnchor="end" fill="#FF5470" fontSize={11} fontWeight={700}>
              Depleted {result.depletedAge}
            </text>
          </>
        )}

        {/* Hover crosshair + dot */}
        {hover != null && (
          <>
            <line x1={sc.x(hover)} x2={sc.x(hover)} y1={padT} y2={base} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
            <circle cx={sc.x(hover)} cy={sc.y(balances[hover])} r={4.5} fill={col} stroke="#0E0F13" strokeWidth={2} />
          </>
        )}

        {xLabels}
      </svg>

      {hover != null && (
        <div
          style={{
            position: 'absolute',
            left: `${(sc.x(hover) / W) * 100}%`,
            top: `${(sc.y(balances[hover]) / H) * 100}%`,
            transform: 'translate(-50%, -125%)',
            pointerEvents: 'none',
            background: '#0E0F13',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 9,
            padding: '7px 10px',
            whiteSpace: 'nowrap',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            zIndex: 5,
          }}
        >
          <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(Math.round(balances[hover]))}</div>
          <div style={{ fontSize: 11, color: '#8A90A2', marginTop: 1 }}>Age {ages[hover]}</div>
        </div>
      )}
    </div>
  )
}
