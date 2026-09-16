import { useId, useRef, useState } from 'react'
import { makeScale, linePath, fmtCompact, fmtUSD } from '../../lib/portfolio'
import { useIsMobile } from '../../lib/useIsMobile'
import type { ProjectionResult } from '../../lib/portfolio'

const W = 680
const H = 270
const padL = 6
const padR = 46
const padT = 16
const padB = 24
const base = H - padB

const BALANCE = '#22E38A'
const CONTRIB = '#35A0FF'
const REAL = '#9B7CFF'

// Compound-growth chart: contributions (blue) with the interest earned on top
// (green band) up to the balance, plus the balance in today's dollars. Hover,
// tap or arrow-key through the years for a breakdown.
export default function ProjectionChart({ p }: { p: ProjectionResult }) {
  const isMobile = useIsMobile()
  const gradId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const sc = makeScale(p.nominal, W, H, padL, padR, padT, padB, 0)
  const n = p.nominal.length
  const lastX = sc.x(n - 1).toFixed(1)
  const firstX = sc.x(0).toFixed(1)

  // Band between contributions and balance = interest earned.
  const interestBand =
    linePath(p.nominal, sc.x, sc.y) +
    ' ' +
    [...p.contributed]
      .map((v, i) => ({ v, i }))
      .reverse()
      .map(({ v, i }) => `L${sc.x(i).toFixed(1)} ${sc.y(v).toFixed(1)}`)
      .join(' ') +
    ' Z'
  const contribArea = linePath(p.contributed, sc.x, sc.y) + ` L${lastX} ${base} L${firstX} ${base} Z`

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
    <text key={`x${k}`} x={sc.x(tk)} y={H - 4} textAnchor={k === 0 ? 'start' : k === ticks.length - 1 ? 'end' : 'middle'} fill="#8A90A2" fontSize={11}>
      {tk}y
    </text>
  ))

  function yearFrom(clientX: number): number {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    const vbx = ((clientX - rect.left) / rect.width) * W
    return Math.max(0, Math.min(n - 1, Math.round(((vbx - padL) / (W - padL - padR)) * (n - 1))))
  }

  const y = hover
  // Phones show the breakdown below the chart, defaulting to the final year.
  const shown = y ?? (isMobile ? n - 1 : null)

  return (
    <div>
      <div
        ref={wrapRef}
        tabIndex={0}
        role="img"
        aria-label={`Growth over ${p.years} years to ${fmtUSD(p.finalNom)}. Use the arrow keys to step through years.`}
        style={{ position: 'relative', userSelect: 'none', touchAction: 'pan-y', outline: 'none' }}
        onMouseMove={(e) => setHover(yearFrom(e.clientX))}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => setHover(yearFrom(e.touches[0].clientX))}
        onTouchMove={(e) => setHover(yearFrom(e.touches[0].clientX))}
        onFocus={() => setHover((h) => h ?? n - 1)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault()
            const d = e.key === 'ArrowLeft' ? -1 : 1
            setHover((h) => Math.max(0, Math.min(n - 1, (h ?? n - 1) + d)))
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
          {grid}
          <path d={contribArea} fill={CONTRIB} fillOpacity={0.1} />
          <path d={interestBand} fill={`url(#${gradId})`} />
          <path d={linePath(p.contributed, sc.x, sc.y)} fill="none" stroke={CONTRIB} strokeWidth={1.8} />
          <path d={linePath(p.real, sc.x, sc.y)} fill="none" stroke={REAL} strokeWidth={2} strokeDasharray="3 4" />
          <path d={linePath(p.nominal, sc.x, sc.y)} fill="none" stroke={BALANCE} strokeWidth={2.5} strokeLinejoin="round" />

          {y != null && (
            <>
              <line x1={sc.x(y)} x2={sc.x(y)} y1={padT} y2={base} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
              <circle cx={sc.x(y)} cy={sc.y(p.contributed[y])} r={4} fill={CONTRIB} stroke="#0E0F13" strokeWidth={2} />
              <circle cx={sc.x(y)} cy={sc.y(p.real[y])} r={4} fill={REAL} stroke="#0E0F13" strokeWidth={2} />
              <circle cx={sc.x(y)} cy={sc.y(p.nominal[y])} r={4.5} fill={BALANCE} stroke="#0E0F13" strokeWidth={2} />
            </>
          )}
          {xLabels}
        </svg>

        {y != null && !isMobile && (
          <div
            style={{
              position: 'absolute',
              top: 4,
              // Sit beside the crosshair, on the side with more room.
              ...(sc.x(y) / W > 0.5 ? { right: `calc(${(100 - (sc.x(y) / W) * 100).toFixed(2)}% + 14px)` } : { left: `calc(${((sc.x(y) / W) * 100).toFixed(2)}% + 14px)` }),
              pointerEvents: 'none',
              background: '#0E0F13',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 10,
              padding: '9px 12px',
              minWidth: 210,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              zIndex: 5,
              fontSize: 12.5,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <Breakdown p={p} year={y} />
          </div>
        )}
      </div>

      {isMobile && shown != null && (
        <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
          <Breakdown p={p} year={shown} />
          {y == null && <div style={{ fontSize: 11, color: '#5B6172', marginTop: 4 }}>Tap the chart to pick a year.</div>}
        </div>
      )}
    </div>
  )
}

function Breakdown({ p, year }: { p: ProjectionResult; year: number }) {
  const balance = p.nominal[year]
  const contributed = p.contributed[year]
  return (
    <>
      <div style={{ color: '#8A90A2', marginBottom: 6, fontWeight: 600 }}>
        {year === 0 ? 'Today' : `Year ${year}`} · {new Date().getFullYear() + year}
      </div>
      <Row label="Balance" value={fmtUSD(balance)} color="#F2F4F8" dot={BALANCE} strong />
      <Row label="Contributions" value={fmtUSD(contributed)} color={CONTRIB} dot={CONTRIB} />
      {p.start > 0 && year > 0 && <div style={{ fontSize: 11, color: '#5B6172', margin: '-2px 0 3px 14px' }}>incl. {fmtUSD(p.start)} starting amount</div>}
      <Row label="Interest earned" value={fmtUSD(balance - contributed)} color={BALANCE} dot={BALANCE} />
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '6px 0 5px' }} />
      <Row label="In today's dollars" value={fmtUSD(p.real[year])} color={REAL} dot={REAL} />
    </>
  )
}

function Row({ label, value, color, dot, strong }: { label: string; value: string; color: string; dot: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0' }}>
      <span style={{ width: 7, height: 7, borderRadius: 2, background: dot, flexShrink: 0 }} />
      <span style={{ color: '#C9CDD8' }}>{label}</span>
      <span style={{ marginLeft: 'auto', paddingLeft: 14, color, fontWeight: strong ? 700 : 600, fontFamily: strong ? "'Space Grotesk'" : undefined, fontSize: strong ? 14 : undefined }}>{value}</span>
    </div>
  )
}
