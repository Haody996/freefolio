import { useEffect, useRef, useState } from 'react'

// A click-to-edit numeric value. Shows a formatted value; click to type an exact
// number. Commits on Enter/blur (clamped), cancels on Escape.
export default function EditableNumber({
  value,
  format,
  min,
  max,
  allowOverMax = false,
  integer = false,
  onCommit,
}: {
  value: number
  format: (n: number) => string
  min: number
  max: number
  allowOverMax?: boolean
  integer?: boolean
  onCommit: (n: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function begin() {
    setText(String(value))
    setEditing(true)
  }

  function commit() {
    const raw = parseFloat(text)
    setEditing(false)
    if (isNaN(raw)) return // revert
    let n = Math.max(min, raw)
    if (!allowOverMax) n = Math.min(max, n)
    if (integer) n = Math.round(n)
    if (n !== value) onCommit(n)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          else if (e.key === 'Escape') setEditing(false)
        }}
        style={{
          width: 96,
          textAlign: 'right',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid #22E38A',
          borderRadius: 7,
          padding: '2px 7px',
          color: '#F2F4F8',
          fontFamily: "'Space Grotesk'",
          fontSize: 14,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          outline: 'none',
        }}
      />
    )
  }

  return (
    <span
      onClick={begin}
      title="Click to edit"
      style={{
        fontSize: 14,
        fontWeight: 700,
        fontFamily: "'Space Grotesk'",
        fontVariantNumeric: 'tabular-nums',
        cursor: 'text',
        borderBottom: '1px dashed rgba(255,255,255,0.25)',
        paddingBottom: 1,
      }}
    >
      {format(value)}
    </span>
  )
}
