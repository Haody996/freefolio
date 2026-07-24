import { ChevronUp, ChevronDown } from 'lucide-react'

// A number input with a clean custom up/down stepper (replaces the browser's
// default spinner, which is hidden globally in index.css).
export default function NumberInput({
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  integer,
  prefix,
  suffix,
}: {
  value: number
  onChange: (n: number) => void
  step?: number
  min?: number
  max?: number
  integer?: boolean
  prefix?: string
  suffix?: string
}) {
  const decimals = (String(step).split('.')[1] || '').length

  function clamp(n: number): number {
    if (min != null) n = Math.max(min, n)
    if (max != null) n = Math.min(max, n)
    if (integer) n = Math.round(n)
    return n
  }
  function bump(dir: 1 | -1) {
    const next = Number((value + dir * step).toFixed(decimals || 6))
    onChange(clamp(next))
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10,
        background: 'rgba(255,255,255,0.05)',
        overflow: 'hidden',
      }}
    >
      {prefix && <span style={{ paddingLeft: 11, color: '#8A90A2', fontSize: 14 }}>{prefix}</span>}
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(clamp(e.target.value === '' ? min ?? 0 : +e.target.value))}
        style={{
          width: '100%',
          minWidth: 0,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: '#F2F4F8',
          fontSize: 14,
          padding: '10px 11px',
          fontVariantNumeric: 'tabular-nums',
          fontFamily: 'inherit',
        }}
      />
      {suffix && <span style={{ paddingRight: 8, color: '#8A90A2', fontSize: 14 }}>{suffix}</span>}
      <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <StepBtn dir="up" onClick={() => bump(1)} />
        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />
        <StepBtn dir="down" onClick={() => bump(-1)} disabled={min != null && value <= min} />
      </div>
    </div>
  )
}

function StepBtn({ dir, onClick, disabled }: { dir: 'up' | 'down'; onClick: () => void; disabled?: boolean }) {
  const Icon = dir === 'up' ? ChevronUp : ChevronDown
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      tabIndex={-1}
      aria-label={dir === 'up' ? 'Increase' : 'Decrease'}
      className="ff-step-btn"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 20,
        border: 'none',
        background: 'transparent',
        color: disabled ? '#3A3F4C' : '#8A90A2',
        cursor: disabled ? 'default' : 'pointer',
        padding: 0,
      }}
    >
      <Icon size={14} strokeWidth={2.5} />
    </button>
  )
}
