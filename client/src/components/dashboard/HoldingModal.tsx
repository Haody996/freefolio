import { useState } from 'react'
import api from '../../lib/api'
import { CATEGORIES, CAT_LABEL, catColor, TOP_CRYPTO, ACCOUNT_TYPES, accountTreatment, TREATMENTS, AUTO_FREQUENCIES, INSTITUTIONS } from '../../lib/portfolio'
import type { Category, AccountType, AutoFrequency, Holding } from '../../lib/portfolio'

export interface Draft {
  symbol: string
  name: string
  category: Category
  accountType: AccountType
  institution: string
  quantity: string
  price: string
  prevClose: string
  autoOn: boolean
  autoAmount: string
  autoFrequency: AutoFrequency
  autoStartDate: string
}

export interface SavePayload {
  symbol: string
  name: string
  category: Category
  accountType: AccountType
  institution: string
  quantity: number
  price: number
  prevClose: number
  autoAmount: number | null
  autoFrequency: AutoFrequency | null
  autoStartDate: string | null
}

function toDraft(h: Holding | null): Draft {
  if (!h)
    return { symbol: '', name: '', category: 'STOCKS', accountType: 'TAXABLE', institution: '', quantity: '', price: '', prevClose: '', autoOn: false, autoAmount: '', autoFrequency: 'MONTHLY', autoStartDate: '' }
  return {
    symbol: h.symbol,
    name: h.name,
    category: h.category,
    accountType: h.accountType,
    institution: h.institution ?? '',
    quantity: String(h.quantity),
    price: String(h.price),
    prevClose: String(h.prevClose),
    autoOn: h.autoAmount != null && h.autoAmount > 0,
    autoAmount: h.autoAmount != null ? String(h.autoAmount) : '',
    autoFrequency: h.autoFrequency ?? 'MONTHLY',
    autoStartDate: h.autoNextAt ? new Date(h.autoNextAt).toISOString().slice(0, 10) : '',
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
  existing,
  onClose,
  onSave,
  onDelete,
}: {
  editing: Holding | null // null = add mode
  existing: Holding[]
  onClose: () => void
  onSave: (p: SavePayload) => void
  onDelete: (h: Holding) => void
}) {
  const isEdit = !!editing
  const [draft, setDraft] = useState<Draft>(toDraft(editing))
  // Quantity can be entered directly (shares) or as a dollar amount (→ shares at price).
  const [entryBy, setEntryBy] = useState<'shares' | 'amount'>('shares')
  const [amountInput, setAmountInput] = useState('')

  const priceNum = parseFloat(draft.price) || 0
  const computedShares = priceNum > 0 ? (parseFloat(amountInput) || 0) / priceNum : 0

  // In add mode, warn when the same ticker + account + institution already exists —
  // saving combines quantities (a different account or brokerage stays separate).
  const dup = !isEdit
    ? existing.find(
        (h) =>
          h.symbol === draft.symbol.toUpperCase().trim() &&
          h.accountType === draft.accountType &&
          (h.institution ?? '') === draft.institution.trim()
      )
    : undefined
  const addQty = parseFloat(draft.quantity) || 0
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
    const autoAmt = draft.autoOn && parseFloat(draft.autoAmount) > 0 ? parseFloat(draft.autoAmount) : null
    // Quantity is either entered directly or derived from a dollar amount.
    const quantity = entryBy === 'amount' ? computedShares : parseFloat(draft.quantity) || 0
    onSave({
      symbol,
      name: draft.name.trim() || symbol,
      category: draft.category,
      accountType: draft.accountType,
      institution: draft.institution.trim(),
      quantity,
      price,
      prevClose: draft.prevClose !== '' && !isNaN(parseFloat(draft.prevClose)) ? parseFloat(draft.prevClose) : price,
      autoAmount: autoAmt,
      autoFrequency: autoAmt != null ? draft.autoFrequency : null,
      autoStartDate: autoAmt != null && draft.autoStartDate ? draft.autoStartDate : null,
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
          maxHeight: 'calc(100vh - 48px)',
          overflowY: 'auto',
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={labelStyle}>Account</label>
            <select
              value={draft.accountType}
              onChange={(e) => set('accountType', e.target.value as AccountType)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {ACCOUNT_TYPES.map((a) => (
                <option key={a.value} value={a.value} style={{ background: '#16181F' }}>
                  {a.label}
                </option>
              ))}
            </select>
            {(() => {
              const t = TREATMENTS.find((x) => x.value === accountTreatment(draft.accountType))!
              return (
                <span style={{ fontSize: 12, color: '#8A90A2' }}>
                  Tax treatment: <span style={{ color: t.color, fontWeight: 700 }}>{t.label}</span>
                  {t.value === 'PRE_TAX' && ' — taxed on withdrawal'}
                  {t.value === 'ROTH' && ' — grows tax-free'}
                </span>
              )
            })()}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={labelStyle}>Institution / brokerage</label>
            <input
              value={draft.institution}
              onChange={(e) => set('institution', e.target.value)}
              list="ff-institutions"
              placeholder="e.g. Charles Schwab (optional)"
              style={inputStyle}
            />
            <datalist id="ff-institutions">
              {INSTITUTIONS.map((i) => (
                <option key={i} value={i} />
              ))}
            </datalist>
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <label style={labelStyle}>{entryBy === 'amount' ? 'Amount' : 'Quantity'}</label>
                <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 7, padding: 2 }}>
                  {(['shares', 'amount'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setEntryBy(m)}
                      style={{ padding: '2px 7px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700, fontFamily: 'inherit', background: entryBy === m ? '#22E38A' : 'transparent', color: entryBy === m ? '#04140C' : '#8A90A2' }}
                    >
                      {m === 'shares' ? 'Shares' : '$'}
                    </button>
                  ))}
                </div>
              </div>
              {entryBy === 'amount' ? (
                <div style={{ display: 'flex', alignItems: 'center', ...inputStyle, padding: 0 }}>
                  <span style={{ paddingLeft: 11, color: '#8A90A2', fontSize: 14 }}>$</span>
                  <input value={amountInput} onChange={(e) => setAmountInput(e.target.value)} type="number" step="any" placeholder="1000" style={{ width: '100%', minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#F2F4F8', fontSize: 14, padding: '11px 11px', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' }} />
                </div>
              ) : (
                <input value={draft.quantity} onChange={(e) => set('quantity', e.target.value)} type="number" step="any" placeholder="0" style={inputStyle} />
              )}
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

          {entryBy === 'amount' && (
            <div style={{ fontSize: 12, color: '#8A90A2', marginTop: -4 }}>
              {priceNum > 0 ? (
                <>≈ <b style={{ color: '#22E38A' }}>{computedShares.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b> shares at ${priceNum.toLocaleString('en-US', { maximumFractionDigits: 2 })}/share</>
              ) : (
                'Enter a price first to convert the amount into shares.'
              )}
            </div>
          )}

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

          {/* Auto-invest (recurring DCA) */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={draft.autoOn}
                onChange={(e) => set('autoOn', e.target.checked)}
                style={{ accentColor: '#22E38A', width: 16, height: 16 }}
              />
              <span style={{ fontSize: 13, fontWeight: 700 }}>Auto-invest on a schedule</span>
            </label>

            {draft.autoOn && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={labelStyle}>Amount</label>
                    <div style={{ display: 'flex', alignItems: 'center', ...inputStyle, padding: 0 }}>
                      <span style={{ paddingLeft: 11, color: '#8A90A2', fontSize: 14 }}>$</span>
                      <input
                        type="number"
                        step="any"
                        value={draft.autoAmount}
                        onChange={(e) => set('autoAmount', e.target.value)}
                        placeholder="500"
                        style={{ width: '100%', minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#F2F4F8', fontSize: 14, padding: '11px 11px', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={labelStyle}>Frequency</label>
                    <select
                      value={draft.autoFrequency}
                      onChange={(e) => set('autoFrequency', e.target.value as AutoFrequency)}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      {AUTO_FREQUENCIES.map((f) => (
                        <option key={f.value} value={f.value} style={{ background: '#16181F' }}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>{isEdit ? 'Next contribution date' : 'Start date'}</label>
                    <input
                      type="date"
                      value={draft.autoStartDate}
                      onChange={(e) => set('autoStartDate', e.target.value)}
                      style={{ ...inputStyle, cursor: 'pointer', colorScheme: 'dark' }}
                    />
                  </div>
                </div>
                <span style={{ fontSize: 12, color: '#8A90A2' }}>
                  Adds{' '}
                  <b style={{ color: '#22E38A' }}>${draft.autoAmount || '0'}</b> of{' '}
                  {draft.symbol.toUpperCase() || 'this holding'}{' '}
                  {AUTO_FREQUENCIES.find((f) => f.value === draft.autoFrequency)?.label.toLowerCase()}
                  {draft.autoStartDate ? `, starting ${draft.autoStartDate}` : ' (starting next period)'}, at that day's price.
                </span>
              </>
            )}
          </div>

          {dup && (
            <div
              style={{
                background: 'rgba(255,176,32,0.08)',
                border: '1px solid rgba(255,176,32,0.3)',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 12.5,
                color: '#F2C879',
                lineHeight: 1.45,
              }}
            >
              You already hold <b>{dup.symbol}</b> ({dup.quantity}) in your{' '}
              <b>{ACCOUNT_TYPES.find((a) => a.value === dup.accountType)?.short}</b>
              {dup.institution ? <> account at <b>{dup.institution}</b></> : ' account'}. Saving will{' '}
              <b>combine</b> them into <b>{dup.quantity + addQty}</b> — the existing position won't be replaced.
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
                {dup ? 'Combine holding' : 'Save holding'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
