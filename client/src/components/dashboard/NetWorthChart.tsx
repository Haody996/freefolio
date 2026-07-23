import { useId, useRef, useState, useEffect } from 'react'
import { makeScale, linePath, fmtUSD, signedUSD, signedPct } from '../../lib/portfolio'
import type { Range } from './NetWorthPanel'

const W = 760
const H = 260
const padL = 6
const padR = 6
const padT = 16
const padB = 26
const base = H - padB

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
  const wrapRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [hover, setHover] = useState<number | null>(null)
  const [drag, setDrag] = useState<{ start: number; end: number } | null>(null)

  // Reset interaction when the underlying series changes (e.g. range switch).
  useEffect(() => {
    setHover(null)
    setDrag(null)
    dragging.current = false
  }, [values.length])

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

  // Map a mouse event to the nearest data index.
  function idxFromEvent(e: React.MouseEvent<HTMLDivElement>): number {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    const vbx = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round(((vbx - padL) / (W - padL - padR)) * (values.length - 1))
    return Math.max(0, Math.min(values.length - 1, i))
  }

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const i = idxFromEvent(e)
    setHover(i)
    if (dragging.current) setDrag((d) => (d ? { start: d.start, end: i } : { start: i, end: i }))
  }
  function onDown(e: React.MouseEvent<HTMLDivElement>) {
    const i = idxFromEvent(e)
    dragging.current = true
    setDrag({ start: i, end: i })
  }
  function onUp() {
    dragging.current = false
    // A click without movement clears the selection.
    setDrag((d) => (d && d.start === d.end ? null : d))
  }
  function onLeave() {
    setHover(null)
    dragging.current = false
  }

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: range === 'ALL' || range === '1Y' ? '2-digit' : undefined })

  // Axis labels (unchanged from the static chart).
  const labels = [0, 1, 2, 3, 4].map((k) => {
    const idx = Math.round((k / 4) * (values.length - 1))
    const dd = dates[idx]
    const lbl =
      range === 'ALL'
        ? dd.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
        : dd.toLocaleDateString('en-US', { month: 'short', day: range === '1M' ? 'numeric' : undefined })
    return (
      <text key={`x${k}`} x={sc.x(idx)} y={H - 6} textAnchor={k === 0 ? 'start' : k === 4 ? 'end' : 'middle'} fill="#8A90A2" fontSize={11}>
        {lbl}
      </text>
    )
  })

  // Drag selection geometry + delta.
  const sel = drag && drag.start !== drag.end ? drag : null
  const lo = sel ? Math.min(sel.start, sel.end) : 0
  const hi = sel ? Math.max(sel.start, sel.end) : 0
  const selChange = sel ? (values[sel.end] - values[sel.start]) / (values[sel.start] || 1) : 0
  const selAbs = sel ? values[sel.end] - values[sel.start] : 0
  const selColor = selChange >= 0 ? '#22E38A' : '#FF5470'

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', userSelect: 'none' }}
      onMouseMove={onMove}
      onMouseDown={onDown}
      onMouseUp={onUp}
      onMouseLeave={onLeave}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', cursor: 'crosshair' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity={0.3} />
            <stop offset="100%" stopColor={col} stopOpacity={0} />
          </linearGradient>
        </defs>

        {[0, 1, 2].map((i) => {
          const yy = padT + (i * (base - padT)) / 2
          return <line key={`g${i}`} x1={padL} x2={W - padR} y1={yy} y2={yy} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
        })}

        <path d={area} fill={`url(#${gradId})`} />
        <path d={linePath(values, sc.x, sc.y)} fill="none" stroke={col} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

        {/* Drag selection band */}
        {sel && (
          <>
            <rect x={sc.x(lo)} y={padT} width={sc.x(hi) - sc.x(lo)} height={base - padT} fill="rgba(255,255,255,0.06)" />
            <line x1={sc.x(sel.start)} x2={sc.x(sel.start)} y1={padT} y2={base} stroke="#8A90A2" strokeWidth={1} strokeDasharray="3 3" />
            <line x1={sc.x(sel.end)} x2={sc.x(sel.end)} y1={padT} y2={base} stroke={selColor} strokeWidth={1} />
          </>
        )}

        {/* Hover crosshair + dot */}
        {hover != null && !sel && (
          <>
            <line x1={sc.x(hover)} x2={sc.x(hover)} y1={padT} y2={base} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
            <circle cx={sc.x(hover)} cy={sc.y(values[hover])} r={4.5} fill={col} stroke="#0E0F13" strokeWidth={2} />
          </>
        )}

        {/* End dot (only when not hovering) */}
        {hover == null && !sel && <circle cx={sc.x(values.length - 1)} cy={sc.y(values[values.length - 1])} r={4} fill={col} />}

        {labels}
      </svg>

      {/* Hover tooltip */}
      {hover != null && !sel && (
        <div
          style={{
            position: 'absolute',
            left: `${(sc.x(hover) / W) * 100}%`,
            top: `${(sc.y(values[hover]) / H) * 100}%`,
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
          <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(values[hover])}</div>
          <div style={{ fontSize: 11, color: '#8A90A2', marginTop: 1 }}>{fmtDate(dates[hover])}</div>
        </div>
      )}

      {/* Drag delta pill */}
      {sel && (
        <div
          style={{
            position: 'absolute',
            left: `${((sc.x(lo) + sc.x(hi)) / 2 / W) * 100}%`,
            top: 0,
            transform: 'translate(-50%, -4px)',
            pointerEvents: 'none',
            background: '#0E0F13',
            border: `1px solid ${selColor}55`,
            borderRadius: 9,
            padding: '7px 11px',
            whiteSpace: 'nowrap',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            textAlign: 'center',
            zIndex: 5,
          }}
        >
          <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 14, color: selColor, fontVariantNumeric: 'tabular-nums' }}>
            {signedPct(selChange)} <span style={{ color: '#8A90A2', fontWeight: 500 }}>·</span> {signedUSD(selAbs)}
          </div>
          <div style={{ fontSize: 11, color: '#8A90A2', marginTop: 1 }}>
            {fmtDate(dates[sel.start])} → {fmtDate(dates[sel.end])}
          </div>
        </div>
      )}
    </div>
  )
}
