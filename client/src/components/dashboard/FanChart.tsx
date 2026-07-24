import { useRef, useState } from 'react'
import { fmtCompact, fmtUSD } from '../../lib/portfolio'
import type { BacktestBand } from '../../lib/retirement'

// Monte Carlo asset-simulation fan chart: 5–95% and 25–75% confidence bands
// around the median, over age, with a retirement marker and hover readout.
export default function FanChart({ bands, retirementAge }: { bands: BacktestBand[]; retirementAge: number }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const W = 720
  const H = 300
  const padL = 46
  const padR = 10
  const padT = 14
  const padB = 26
  const base = H - padB
  const plotW = W - padL - padR

  if (bands.length < 2) return null

  const max = Math.max(...bands.map((b) => b.p95), 1) * 1.05
  const x = (i: number) => padL + (i / (bands.length - 1)) * plotW
  const y = (v: number) => padT + (1 - v / max) * (base - padT)

  const areaBetween = (upper: (b: BacktestBand) => number, lower: (b: BacktestBand) => number) => {
    const top = bands.map((b, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(upper(b)).toFixed(1)}`).join(' ')
    const bot = bands.map((_, i) => `L${x(bands.length - 1 - i).toFixed(1)} ${y(lower(bands[bands.length - 1 - i])).toFixed(1)}`).join(' ')
    return `${top} ${bot} Z`
  }
  const median = bands.map((b, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(b.p50).toFixed(1)}`).join(' ')

  const grid = [0, 1, 2, 3, 4].map((i) => {
    const v = (i / 4) * max
    const yy = y(v)
    return (
      <g key={`g${i}`}>
        <line x1={padL} x2={W - padR} y1={yy} y2={yy} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
        <text x={padL - 6} y={yy + 4} textAnchor="end" fill="#8A90A2" fontSize={10}>{fmtCompact(v)}</text>
      </g>
    )
  })

  const retIdx = bands.findIndex((b) => b.age >= retirementAge)
  const xLabels = [0, 0.25, 0.5, 0.75, 1].map((f, k) => {
    const idx = Math.round(f * (bands.length - 1))
    return (
      <text key={k} x={x(idx)} y={H - 6} textAnchor={k === 0 ? 'start' : k === 4 ? 'end' : 'middle'} fill="#8A90A2" fontSize={11}>
        {bands[idx].age}
      </text>
    )
  })

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const vbx = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round(((vbx - padL) / plotW) * (bands.length - 1))
    setHover(Math.max(0, Math.min(bands.length - 1, i)))
  }
  const hb = hover != null ? bands[hover] : null

  return (
    <div ref={wrapRef} style={{ position: 'relative' }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        {grid}
        <path d={areaBetween((b) => b.p95, (b) => b.p5)} fill="rgba(124,92,255,0.14)" />
        <path d={areaBetween((b) => b.p75, (b) => b.p25)} fill="rgba(124,92,255,0.30)" />
        <path d={median} fill="none" stroke="#7C5CFF" strokeWidth={2.5} />
        {retIdx >= 0 && (
          <>
            <line x1={x(retIdx)} x2={x(retIdx)} y1={padT} y2={base} stroke="rgba(255,255,255,0.25)" strokeWidth={1} strokeDasharray="4 4" />
            <text x={x(retIdx) + 5} y={padT + 11} fill="#9B7CFF" fontSize={11} fontWeight={700}>Retire {retirementAge}</text>
          </>
        )}
        {hb && <line x1={x(hover!)} x2={x(hover!)} y1={padT} y2={base} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />}
        {xLabels}
      </svg>

      {hb && (
        <div
          style={{
            position: 'absolute', left: `${(x(hover!) / W) * 100}%`, top: 4, transform: 'translate(-50%, 0)', pointerEvents: 'none',
            background: '#0E0F13', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, padding: '8px 10px', whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', fontSize: 11.5,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 3 }}>Age {hb.age}</div>
          <div style={{ color: '#8A90A2' }}>5–95%: <b style={{ color: '#C9CDD8' }}>{fmtCompact(hb.p5)} – {fmtCompact(hb.p95)}</b></div>
          <div style={{ color: '#8A90A2' }}>25–75%: <b style={{ color: '#C9CDD8' }}>{fmtCompact(hb.p25)} – {fmtCompact(hb.p75)}</b></div>
          <div style={{ color: '#8A90A2' }}>Median: <b style={{ color: '#9B7CFF' }}>{fmtUSD(Math.round(hb.p50))}</b></div>
        </div>
      )}
    </div>
  )
}
