import type { Replacement } from '../../lib/reports'

// Similar funds to hold during the 30-day wash-sale window (curated server-side).
export default function Replacements({ list, note }: { list: Replacement[]; note: string }) {
  return (
    <div style={{ marginTop: 8 }}>
      {list.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#8A90A2' }}>Hold instead for 31+ days:</span>
          {list.map((r) => (
            <span key={r.symbol} title={`${r.name} — tracks ${r.tracks}`} style={{ fontSize: 12, fontWeight: 700, color: '#35A0FF', background: 'rgba(53,160,255,0.12)', borderRadius: 6, padding: '2px 7px' }}>
              {r.symbol}
            </span>
          ))}
        </div>
      )}
      <div style={{ fontSize: 12, color: '#8A90A2', marginTop: 5, lineHeight: 1.45 }}>{note}</div>
    </div>
  )
}
