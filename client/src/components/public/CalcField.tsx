import NumberInput from '../dashboard/NumberInput'

// Labeled numeric input for calculator forms.
export default function CalcField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step,
  integer,
  min,
  max,
  hint,
  span,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  prefix?: string
  suffix?: string
  step?: number
  integer?: boolean
  min?: number
  max?: number
  hint?: string
  span?: boolean
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: span ? '1 / -1' : undefined, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: '#8A90A2', fontWeight: 600 }}>{label}</span>
      <NumberInput value={value} onChange={onChange} prefix={prefix} suffix={suffix} step={step ?? (integer ? 1 : undefined)} integer={integer} min={min} max={max} />
      {hint && <span style={{ fontSize: 11.5, color: '#5B6172' }}>{hint}</span>}
    </label>
  )
}
