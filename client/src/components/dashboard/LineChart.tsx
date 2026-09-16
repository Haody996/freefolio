import { useId, useRef, useState } from 'react'

export interface LineSeries {
  key: string
  label: string
  color: string
  values: (number | null)[]
  dashed?: boolean
  area?: boolean // gradient fill under the line
}

// Multi-series SVG line chart with a hover/touch crosshair and a tooltip listing
// every series at that point. Shares the dashboard's visual language.
export default function LineChart({
  series,
  labels,
  yFormat,
  tickFormat,
  height = 260,
  zeroBased = false,
  refLines = [],
}: {
  series: LineSeries[]
  labels: string[] // tooltip label per index
  yFormat: (n: number) => string
  tickFormat?: (i: number) => string // x-axis tick label (defaults to labels[i])
  height?: number
  zeroBased?: boolean
  refLines?: { value: number; label: string; color: string }[]
}) {
  const gradId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const W = 760
  const H = height
  const padL = 8
  const padR = 58
  const padT = 14
  const padB = 26
  const base = H - padB
  const n = Math.max(...series.map((s) => s.values.length), 0)

  const all = [...series.flatMap((s) => s.values.filter((v): v is number => v != null && isFinite(v))), ...refLines.map((r) => r.value)]
  if (n < 2 || all.length === 0) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A90A2', fontSize: 13 }}>Not enough data to chart yet.</div>
  }
  let mn = Math.min(...all)
  let mx = Math.max(...all)
  if (zeroBased) mn = Math.min(0, mn)
  const pad = (mx - mn || Math.abs(mx) || 1) * 0.06
  if (!zeroBased || mn < 0) mn -= pad
  mx += pad
  // Snap the axis to round tick values (1 / 2 / 2.5 / 5 × 10^k).
  const rawStep = (mx - mn) / 3
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= rawStep) ?? rawStep
  mn = Math.floor(mn / step) * step
  mx = Math.ceil(mx / step) * step
  const x = (i: number) => padL + (i / (n - 1)) * (W - padL - padR)
  const y = (v: number) => padT + (1 - (v - mn) / (mx - mn || 1)) * (base - padT)

  function path(values: (number | null)[]): string {
    let d = ''
    let pen = false
    values.forEach((v, i) => {
      if (v == null || !isFinite(v)) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `
      pen = true
    })
    return d
  }

  function idxFrom(clientX: number): number {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    const vbx = ((clientX - rect.left) / rect.width) * W
    return Math.max(0, Math.min(n - 1, Math.round(((vbx - padL) / (W - padL - padR)) * (n - 1))))
  }

  const ticks: number[] = []
  for (let v = mn; v <= mx + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : v)
  const xTicks = [0, 1, 2, 3, 4].map((k) => Math.round((k / 4) * (n - 1)))

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', userSelect: 'none', touchAction: 'pan-y' }}
      onMouseMove={(e) => setHover(idxFrom(e.clientX))}
      onMouseLeave={() => setHover(null)}
      onTouchStart={(e) => setHover(idxFrom(e.touches[0].clientX))}
      onTouchMove={(e) => setHover(idxFrom(e.touches[0].clientX))}
      onTouchEnd={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', cursor: 'crosshair' }}>
        <defs>
          {series.map((s, si) => (
            <linearGradient key={s.key} id={`${gradId}-${si}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.24} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((v, k) => (
          <g key={`t${k}`}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
            <text x={W - padR + 6} y={y(v) + 4} fill="#8A90A2" fontSize={10}>
              {yFormat(v)}
            </text>
          </g>
        ))}
        {refLines.map((r) => (
          <g key={r.label}>
            <line x1={padL} x2={W - padR} y1={y(r.value)} y2={y(r.value)} stroke={r.color} strokeWidth={1.5} strokeDasharray="5 4" />
            <text x={padL + 4} y={y(r.value) - 5} fill={r.color} fontSize={10} fontWeight={700}>
              {r.label}
            </text>
          </g>
        ))}
        {series.map((s, si) => {
          if (!s.area) return null
          const firstIdx = s.values.findIndex((v) => v != null)
          let lastIdx = s.values.length - 1
          while (lastIdx > 0 && s.values[lastIdx] == null) lastIdx--
          if (firstIdx < 0) return null
          return <path key={`a${s.key}`} d={`${path(s.values)} L${x(lastIdx).toFixed(1)} ${base} L${x(firstIdx).toFixed(1)} ${base} Z`} fill={`url(#${gradId}-${si})`} />
        })}
        {series.map((s) => (
          <path key={s.key} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={s.dashed ? 1.8 : 2.4} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {hover != null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={base} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
            {series.map((s) => {
              const v = s.values[hover]
              return v != null && isFinite(v) ? <circle key={s.key} cx={x(hover)} cy={y(v)} r={4} fill={s.color} stroke="#0E0F13" strokeWidth={2} /> : null
            })}
          </>
        )}
        {xTicks.map((i, k) => (
          <text key={`x${k}`} x={x(i)} y={H - 6} textAnchor={k === 0 ? 'start' : k === 4 ? 'end' : 'middle'} fill="#8A90A2" fontSize={11}>
            {tickFormat ? tickFormat(i) : labels[i]}
          </text>
        ))}
      </svg>

      {hover != null && (
        <div
          style={{
            position: 'absolute',
            left: `${Math.min(80, Math.max(20, (x(hover) / W) * 100))}%`,
            top: 0,
            transform: 'translate(-50%, -8px)',
            pointerEvents: 'none',
            background: '#0E0F13',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 9,
            padding: '7px 10px',
            whiteSpace: 'nowrap',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            zIndex: 5,
            fontSize: 12,
          }}
        >
          <div style={{ color: '#8A90A2', marginBottom: 3 }}>{labels[hover]}</div>
          {series.map((s) => {
            const v = s.values[hover]
            if (v == null || !isFinite(v)) return null
            return (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                <span style={{ color: '#C9CDD8' }}>{s.label}</span>
                <b style={{ marginLeft: 'auto', paddingLeft: 10, fontFamily: "'Space Grotesk'" }}>{yFormat(v)}</b>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function ChartLegend({ items }: { items: { color: string; label: string; dashed?: boolean }[] }) {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#8A90A2', marginTop: 10 }}>
      {items.map((i) => (
        <span key={i.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 16, height: 0, borderTop: `${i.dashed ? '2px dashed' : '3px solid'} ${i.color}` }} /> {i.label}
        </span>
      ))}
    </div>
  )
}
