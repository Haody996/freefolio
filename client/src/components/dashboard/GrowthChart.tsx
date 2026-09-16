import { useId, useRef, useState } from 'react'
import { fmtCompact, fmtUSD } from '../../lib/portfolio'
import { useIsMobile } from '../../lib/useIsMobile'

const W = 680
const H = 270
const padL = 6
const padR = 46
const padT = 16
const padB = 24
const base = H - padB

export const BALANCE = '#22E38A'
export const CONTRIB = '#35A0FF'
export const REAL = '#9B7CFF'

export interface GrowthLine {
  label: string
  color: string
  values: number[]
  dashed?: boolean
}

// Growth of savings over time for the calculators: contributions (blue area)
// with the interest earned on top (green band) up to the balance, optional
// extra lines (today's dollars, "needed to coast") and a reference level (FIRE
// number). Hover, tap or arrow-key through the points for a breakdown of
// balance, contributions and interest, plus calculator-specific rows.
export default function GrowthChart({
  balances,
  contributions,
  startAmount,
  tickLabel,
  pointLabel,
  lines = [],
  refLine,
  extraRows,
  ariaLabel,
}: {
  balances: number[]
  contributions: number[] // cumulative, including the starting amount
  startAmount: number
  tickLabel: (i: number) => string
  pointLabel: (i: number) => string
  lines?: GrowthLine[]
  refLine?: { label: string; value: number; color: string }
  extraRows?: (i: number) => React.ReactNode
  ariaLabel: string
}) {
  const isMobile = useIsMobile()
  const gradId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const n = balances.length
  if (n < 2) {
    return <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A90A2', fontSize: 13 }}>Nothing to chart yet.</div>
  }

  // Zero-based axis snapped to round ticks (1 / 2 / 2.5 / 5 × 10^k).
  const peak = Math.max(1, ...balances, ...contributions, ...lines.flatMap((l) => l.values), refLine?.value ?? 0) * 1.06
  const rawStep = peak / 3
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rawStep) ?? rawStep
  const top = Math.ceil(peak / step) * step
  const x = (i: number) => padL + (i / (n - 1)) * (W - padL - padR)
  const yv = (v: number) => padT + (1 - Math.max(0, v) / top) * (base - padT)
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${yv(v).toFixed(1)}`).join(' ')

  const interestBand =
    path(balances) +
    ' ' +
    contributions
      .map((v, i) => `L${x(i).toFixed(1)} ${yv(v).toFixed(1)}`)
      .reverse()
      .join(' ') +
    ' Z'
  const contribArea = path(contributions) + ` L${x(n - 1).toFixed(1)} ${base} L${x(0).toFixed(1)} ${base} Z`

  const ticks: number[] = []
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v)
  const xTicks = [0, 1, 2, 3, 4].map((k) => Math.round((k / 4) * (n - 1)))

  function indexFrom(clientX: number): number {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    const vbx = ((clientX - rect.left) / rect.width) * W
    return Math.max(0, Math.min(n - 1, Math.round(((vbx - padL) / (W - padL - padR)) * (n - 1))))
  }

  const h = hover
  // Phones show the breakdown below the chart, defaulting to the last point.
  const shown = h ?? (isMobile ? n - 1 : null)

  const breakdown = (i: number) => (
    <>
      <div style={{ color: '#8A90A2', marginBottom: 6, fontWeight: 600 }}>{pointLabel(i)}</div>
      <Row label="Balance" value={fmtUSD(balances[i])} color="#F2F4F8" dot={BALANCE} strong />
      <Row label="Contributions" value={fmtUSD(contributions[i])} color={CONTRIB} dot={CONTRIB} />
      {startAmount > 0 && i > 0 && <div style={{ fontSize: 11, color: '#5B6172', margin: '-2px 0 3px 14px' }}>incl. {fmtUSD(startAmount)} starting amount</div>}
      <Row label="Interest earned" value={fmtUSD(balances[i] - contributions[i])} color={BALANCE} dot={BALANCE} />
      {extraRows && (
        <>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '6px 0 5px' }} />
          {extraRows(i)}
        </>
      )}
    </>
  )

  return (
    <div>
      <div
        ref={wrapRef}
        tabIndex={0}
        role="img"
        aria-label={`${ariaLabel} Use the arrow keys to step through the chart.`}
        style={{ position: 'relative', userSelect: 'none', touchAction: 'pan-y', outline: 'none' }}
        onMouseMove={(e) => setHover(indexFrom(e.clientX))}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => setHover(indexFrom(e.touches[0].clientX))}
        onTouchMove={(e) => setHover(indexFrom(e.touches[0].clientX))}
        onFocus={() => setHover((v) => v ?? n - 1)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault()
            const d = e.key === 'ArrowLeft' ? -1 : 1
            setHover((v) => Math.max(0, Math.min(n - 1, (v ?? n - 1) + d)))
          } else if (e.key === 'Home') setHover(0)
          else if (e.key === 'End') setHover(n - 1)
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', cursor: 'crosshair' }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BALANCE} stopOpacity={0.3} />
              <stop offset="100%" stopColor={BALANCE} stopOpacity={0.06} />
            </linearGradient>
          </defs>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={padL} x2={W - padR} y1={yv(v)} y2={yv(v)} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
              <text x={W - padR + 6} y={yv(v) + 4} fill="#8A90A2" fontSize={10}>
                {fmtCompact(v)}
              </text>
            </g>
          ))}
          <path d={contribArea} fill={CONTRIB} fillOpacity={0.1} />
          <path d={interestBand} fill={`url(#${gradId})`} />
          {refLine && (
            <g>
              <line x1={padL} x2={W - padR} y1={yv(refLine.value)} y2={yv(refLine.value)} stroke={refLine.color} strokeWidth={1.5} strokeDasharray="5 4" />
              <text x={padL + 4} y={yv(refLine.value) - 5} fill={refLine.color} fontSize={10} fontWeight={700}>
                {refLine.label}
              </text>
            </g>
          )}
          <path d={path(contributions)} fill="none" stroke={CONTRIB} strokeWidth={1.8} />
          {lines.map((l) => (
            <path key={l.label} d={path(l.values)} fill="none" stroke={l.color} strokeWidth={2} strokeDasharray={l.dashed ? '3 4' : undefined} />
          ))}
          <path d={path(balances)} fill="none" stroke={BALANCE} strokeWidth={2.5} strokeLinejoin="round" />

          {h != null && (
            <>
              <line x1={x(h)} x2={x(h)} y1={padT} y2={base} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
              <circle cx={x(h)} cy={yv(contributions[h])} r={4} fill={CONTRIB} stroke="#0E0F13" strokeWidth={2} />
              {lines.map((l) => (
                <circle key={l.label} cx={x(h)} cy={yv(l.values[h])} r={4} fill={l.color} stroke="#0E0F13" strokeWidth={2} />
              ))}
              <circle cx={x(h)} cy={yv(balances[h])} r={4.5} fill={BALANCE} stroke="#0E0F13" strokeWidth={2} />
            </>
          )}
          {xTicks.map((i, k) => (
            <text key={`x${k}`} x={x(i)} y={H - 4} textAnchor={k === 0 ? 'start' : k === 4 ? 'end' : 'middle'} fill="#8A90A2" fontSize={11}>
              {tickLabel(i)}
            </text>
          ))}
        </svg>

        {h != null && !isMobile && (
          <div
            style={{
              position: 'absolute',
              top: 4,
              // Sit beside the crosshair, on the side with more room.
              ...(x(h) / W > 0.5 ? { right: `calc(${(100 - (x(h) / W) * 100).toFixed(2)}% + 14px)` } : { left: `calc(${((x(h) / W) * 100).toFixed(2)}% + 14px)` }),
              pointerEvents: 'none',
              background: '#0E0F13',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10,
              padding: '9px 12px',
              minWidth: 220,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              zIndex: 5,
              fontSize: 12.5,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {breakdown(h)}
          </div>
        )}
      </div>

      {isMobile && shown != null && (
        <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
          {breakdown(shown)}
          {h == null && <div style={{ fontSize: 11, color: '#5B6172', marginTop: 4 }}>Tap the chart to pick a point.</div>}
        </div>
      )}
    </div>
  )
}

export function Row({ label, value, color, dot, strong }: { label: string; value: string; color: string; dot: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0' }}>
      <span style={{ width: 7, height: 7, borderRadius: 2, background: dot, flexShrink: 0 }} />
      <span style={{ color: '#C9CDD8' }}>{label}</span>
      <span style={{ marginLeft: 'auto', paddingLeft: 14, color, fontWeight: strong ? 700 : 600, fontFamily: strong ? "'Space Grotesk'" : undefined, fontSize: strong ? 14 : undefined }}>{value}</span>
    </div>
  )
}
