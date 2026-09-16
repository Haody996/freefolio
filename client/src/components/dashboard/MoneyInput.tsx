import { inputStyle } from '../ui/styles'

// A text-entry number field with an optional $ prefix or % / unit suffix.
export default function MoneyInput({
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  prefix?: string
  suffix?: string
  placeholder?: string
  ariaLabel?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', ...inputStyle, padding: 0 }}>
      {prefix && <span style={{ paddingLeft: 11, color: '#8A90A2', fontSize: 14 }}>{prefix}</span>}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type="number"
        step="any"
        inputMode="decimal"
        aria-label={ariaLabel}
        placeholder={placeholder}
        style={{ width: '100%', minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#F2F4F8', fontSize: 14, padding: '11px 11px', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' }}
      />
      {suffix && <span style={{ paddingRight: 11, color: '#8A90A2', fontSize: 14, whiteSpace: 'nowrap' }}>{suffix}</span>}
    </div>
  )
}
