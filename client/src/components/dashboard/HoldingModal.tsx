import { useState } from 'react'
import api from '../../lib/api'
import { CATEGORIES, CAT_LABEL, catColor, TOP_CRYPTO } from '../../lib/portfolio'
import type { Category, Holding } from '../../lib/portfolio'

export interface Draft {
  symbol: string
  name: string
  category: Category
  quantity: string
  price: string
  prevClose: string
}

export interface SavePayload {
  symbol: string
  name: string
  category: Category
  quantity: number
  price: number
  prevClose: number
}

function toDraft(h: Holding | null): Draft {
  if (!h) return { symbol: '', name: '', category: 'STOCKS', quantity: '', price: '', prevClose: '' }
  return {
    symbol: h.symbol,
    name: h.name,
    category: h.category,
    quantity: String(h.quantity),
    price: String(h.price),
    prevClose: String(h.prevClose),
  }
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  padding: '11px 13px',
  color: '#F2F4F8',
  fontFamily: 'inherit',
  fontSize: 14,
  fontVariantNumeric: 'tabular-nums',
}
const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.4,
  color: '#8A90A2',
  textTransform: 'uppercase',
}

export default function HoldingModal({
  editing,
  onClose,
  onSave,
  onDelete,
}: {
  editing: Holding | null // null = add mode
  onClose: () => void
  onSave: (p: SavePayload) => void
  onDelete: (h: Holding) => void
}) {
  const isEdit = !!editing
  const [draft, setDraft] = useState<Draft>(toDraft(editing))
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  function set<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [field]: value }))
  }

  const isMarketPriced = draft.category !== 'CASH' && draft.category !== 'OTHER'

  // When a ticker is typed/picked, set its name (for known crypto) and fetch a
  // live quote to prefill price + previous close where those fields are empty.
  function onTicker(value: string) {
    const sym = value.toUpperCase()
    setDraft((d) => {
      const known = TOP_CRYPTO.find((c) => c.symbol === sym)
      return { ...d, symbol: value, name: known && !d.name ? known.name : d.name }
    })
  }

  async function syncQuote() {
    const sym = draft.symbol.toUpperCase().trim()
    if (!sym || !isMarketPriced) return
    setSyncing(true)
    setSyncMsg('')
    try {
      const { data } = await api.get('/prices/quote', { params: { symbol: sym, category: draft.category } })
      const q = data.quote as { price: number; prevClose: number }
      setDraft((d) => ({
        ...d,
        price: d.price === '' ? String(q.price) : d.price,
        prevClose: d.prevClose === '' ? String(q.prevClose ?? q.price) : d.prevClose,
      }))
      setSyncMsg(`Live: $${q.price.toLocaleString()} · prev close $${(q.prevClose ?? q.price).toLocaleString()}`)
    } catch {
      setSyncMsg('No live quote for that ticker — enter values manually.')
    } finally {
      setSyncing(false)
    }
  }

  function save() {
    const price = parseFloat(draft.price) || 0
    const symbol = draft.symbol.toUpperCase().trim() || 'NEW'
    onSave({
      symbol,
      name: draft.name.trim() || symbol,
      category: draft.category,
      quantity: parseFloat(draft.quantity) || 0,
      price,
      prevClose: draft.prevClose !== '' && !isNaN(parseFloat(draft.prevClose)) ? parseFloat(draft.prevClose) : price,
    })
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(6,7,10,0.65)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          maxWidth: '100%',
          background: '#16181F',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 20,
          padding: 26,
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontFamily: "'Space Grotesk'", fontSize: 19, fontWeight: 700 }}>
            {isEdit ? 'Edit holding' : 'Add holding'}
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              border: 'none',
              background: 'rgba(255,255,255,0.06)',
              color: '#8A90A2',
              fontSize: 18,
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={labelStyle}>Asset class</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {CATEGORIES.map((c) => {
                const selected = draft.category === c
                return (
                  <button
                    key={c}
                    onClick={() => set('category', c)}
                    style={{
                      padding: '8px 0',
                      borderRadius: 9,
                      border: '1px solid ' + (selected ? catColor(c) : 'rgba(255,255,255,0.1)'),
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                      fontFamily: 'inherit',
                      flex: 1,
                      background: selected ? catColor(c) : 'transparent',
                      color: selected ? '#04140C' : '#8A90A2',
                    }}
                  >
                    {CAT_LABEL[c]}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={labelStyle}>Ticker</label>
              <input
                value={draft.symbol}
                onChange={(e) => onTicker(e.target.value)}
                onBlur={syncQuote}
                list={draft.category === 'CRYPTO' ? 'ff-top-crypto' : undefined}
                placeholder={draft.category === 'CRYPTO' ? 'e.g. BTC' : 'e.g. TSLA'}
                style={{ ...inputStyle, fontWeight: 600, textTransform: 'uppercase' }}
              />
              {draft.category === 'CRYPTO' && (
                <datalist id="ff-top-crypto">
                  {TOP_CRYPTO.map((c) => (
                    <option key={c.symbol} value={c.symbol}>
                      {c.name}
                    </option>
                  ))}
                </datalist>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={labelStyle}>Name</label>
              <input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Tesla Inc" style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={labelStyle}>Quantity</label>
              <input value={draft.quantity} onChange={(e) => set('quantity', e.target.value)} type="number" step="any" placeholder="0" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={labelStyle}>Price</label>
              <input value={draft.price} onChange={(e) => set('price', e.target.value)} type="number" step="any" placeholder="0.00" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={labelStyle}>Prev close</label>
              <input value={draft.prevClose} onChange={(e) => set('prevClose', e.target.value)} type="number" step="any" placeholder="optional" style={inputStyle} />
            </div>
          </div>
          {isMarketPriced ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: -4, minHeight: 18 }}>
              <button
                type="button"
                onClick={syncQuote}
                disabled={syncing || !draft.symbol.trim()}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: syncing || !draft.symbol.trim() ? '#5B6172' : '#22E38A',
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  cursor: syncing || !draft.symbol.trim() ? 'default' : 'pointer',
                  padding: 0,
                }}
              >
                {syncing ? 'Fetching…' : '↻ Fetch live price'}
              </button>
              {syncMsg && <span style={{ fontSize: 12, color: '#8A90A2' }}>{syncMsg}</span>}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#8A90A2', marginTop: -4 }}>
              For cash or manual entries, set quantity to 1 and price to the total value.
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            {isEdit && (
              <button
                onClick={() => editing && onDelete(editing)}
                style={{
                  padding: '11px 16px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,84,112,0.35)',
                  background: 'rgba(255,84,112,0.1)',
                  color: '#FF5470',
                  fontWeight: 700,
                  fontSize: 13,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
              <button
                onClick={onClose}
                style={{
                  padding: '11px 18px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'transparent',
                  color: '#C9CDD8',
                  fontWeight: 600,
                  fontSize: 13,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={save}
                style={{
                  padding: '11px 20px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#22E38A',
                  color: '#04140C',
                  fontWeight: 700,
                  fontSize: 13,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                Save holding
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
