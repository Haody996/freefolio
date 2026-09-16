import { useState } from 'react'
import api from '../../lib/api'
import {
  CATEGORIES,
  CAT_LABEL,
  catColor,
  TOP_CRYPTO,
  ACCOUNT_TYPES,
  accountTreatment,
  TREATMENTS,
  AUTO_FREQUENCIES,
  INSTITUTIONS,
  METALS,
  METAL_UNITS,
  isMarketPriced,
  isEstimatedAsset,
  fmtUSD,
} from '../../lib/portfolio'
import type { Category, AccountType, AutoFrequency, Holding } from '../../lib/portfolio'
import CryptoPicker from './CryptoPicker'
import MoneyInput from './MoneyInput'

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
  openingCost: string // avg cost per share/oz, or purchase price for real estate & vehicles
  openingDate: string
  providerId: string | null
  valueMode: 'manual' | 'estimate' // real estate & vehicles
  appreciationPct: string
  metalUnit: 'oz' | 'g' | 'kg'
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
  openingCostPerShare: number | null
  openingAcquiredAt: string | null
  providerId: string | null
  appreciationPct: number | null
}

const DEFAULT_RATE: Partial<Record<Category, string>> = { REAL_ESTATE: '3.5', VEHICLE: '-15' }

function toDraft(h: Holding | null): Draft {
  if (!h)
    return { symbol: '', name: '', category: 'STOCKS', accountType: 'TAXABLE', institution: '', quantity: '', price: '', prevClose: '', autoOn: false, autoAmount: '', autoFrequency: 'MONTHLY', autoStartDate: '', openingCost: '', openingDate: '', providerId: null, valueMode: 'manual', appreciationPct: '', metalUnit: 'oz' }
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
    openingCost: h.openingCostPerShare != null ? String(h.openingCostPerShare) : '',
    openingDate: h.openingAcquiredAt ? new Date(h.openingAcquiredAt).toISOString().slice(0, 10) : '',
    providerId: h.providerId,
    valueMode: isEstimatedAsset(h) ? 'estimate' : 'manual',
    appreciationPct: h.appreciationPct != null ? String(h.appreciationPct) : DEFAULT_RATE[h.category] ?? '',
    metalUnit: 'oz',
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
const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }

function yearsSince(date: string): number {
  const t = new Date(date).getTime()
  return isNaN(t) ? 0 : Math.max(0, (Date.now() - t) / (365.25 * 86_400_000))
}

export default function HoldingModal({
  editing,
  existing,
  openingQty,
  onClose,
  onSave,
  onDelete,
  onTransact,
}: {
  editing: Holding | null // null = add mode
  existing: Holding[]
  openingQty?: number // shares of `editing` not covered by logged buys
  onClose: () => void
  onSave: (p: SavePayload) => void
  onDelete: (h: Holding) => void
  onTransact?: (h: Holding) => void
}) {
  const isEdit = !!editing
  const [draft, setDraft] = useState<Draft>(toDraft(editing))
  // Quantity can be entered directly (shares) or as a dollar amount (→ shares at price).
  const [entryBy, setEntryBy] = useState<'shares' | 'amount'>('shares')
  const [amountInput, setAmountInput] = useState('')

  const priceNum = parseFloat(draft.price) || 0
  const computedShares = priceNum > 0 ? (parseFloat(amountInput) || 0) / priceNum : 0

  const cat = draft.category
  const marketPriced = isMarketPriced(cat)
  const isCash = cat === 'CASH'
  const isMetal = cat === 'METALS'
  const isProperty = cat === 'REAL_ESTATE' || cat === 'VEHICLE'
  const isManual = !marketPriced // cash / other / real estate / vehicles → single value
  const estimating = isProperty && draft.valueMode === 'estimate'
  const unitToOz = isMetal ? METAL_UNITS.find((u) => u.value === draft.metalUnit)!.toOz : 1
  const unitLabel = isMetal ? METAL_UNITS.find((u) => u.value === draft.metalUnit)!.label : 'shares'

  // In add mode, warn when the same ticker + account + institution already exists —
  // saving combines quantities (a different account or brokerage stays separate).
  const dup = !isEdit
    ? existing.find(
        (h) =>
          h.symbol === draft.symbol.toUpperCase().trim() &&
          h.accountType === (isProperty ? 'OTHER' : draft.accountType) &&
          (h.institution ?? '') === (isProperty ? '' : draft.institution.trim())
      )
    : undefined
  const addQty = (entryBy === 'amount' ? computedShares : parseFloat(draft.quantity) || 0) * unitToOz
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  function set<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [field]: value }))
  }

  function setCategory(c: Category) {
    setSyncMsg('')
    setDraft((d) => ({
      ...d,
      category: c,
      symbol: d.category === c ? d.symbol : '',
      // A new holding's name/price belonged to the previous asset class.
      ...(isEdit || d.category === c ? {} : { name: '', price: '', prevClose: '', openingCost: '', openingDate: '' }),
      providerId: null,
      appreciationPct: DEFAULT_RATE[c] ?? d.appreciationPct,
      accountType: c === 'REAL_ESTATE' || c === 'VEHICLE' ? 'OTHER' : d.accountType,
    }))
  }

  async function fetchQuote(symbol: string, providerId: string | null, category: Category) {
    const sym = symbol.toUpperCase().trim()
    if (!sym || !isMarketPriced(category)) return
    setSyncing(true)
    setSyncMsg('')
    try {
      const { data } = await api.get('/prices/quote', { params: { symbol: sym, category, providerId: providerId || undefined } })
      const q = data.quote as { price: number; prevClose: number }
      setDraft((d) => ({
        ...d,
        price: d.price === '' ? String(q.price) : d.price,
        prevClose: d.prevClose === '' ? String(q.prevClose ?? q.price) : d.prevClose,
      }))
      const per = category === 'METALS' ? '/oz' : ''
      setSyncMsg(`Live: $${q.price.toLocaleString()}${per} · prev close $${(q.prevClose ?? q.price).toLocaleString()}`)
    } catch {
      setSyncMsg('No live quote for that ticker — enter values manually.')
    } finally {
      setSyncing(false)
    }
  }

  function syncQuote() {
    fetchQuote(draft.symbol, draft.providerId, cat)
  }

  // Typing a ticker (stocks/bonds): set the name for known crypto.
  function onTicker(value: string) {
    const sym = value.toUpperCase()
    setDraft((d) => {
      const known = TOP_CRYPTO.find((c) => c.symbol === sym)
      return { ...d, symbol: value, name: known && !d.name ? known.name : d.name }
    })
  }

  function pickMetal(symbol: string, name: string) {
    setDraft((d) => ({ ...d, symbol, name: d.name && !METALS.some((m) => m.name === d.name) ? d.name : name, price: '', prevClose: '' }))
    fetchQuote(symbol, null, 'METALS')
  }

  // Estimated value preview for real estate / vehicles.
  const purchase = parseFloat(draft.openingCost) || 0
  const rate = parseFloat(draft.appreciationPct)
  const estimate = estimating && purchase > 0 && draft.openingDate && !isNaN(rate) ? purchase * Math.pow(1 + rate / 100, yearsSince(draft.openingDate)) : null

  function save() {
    const symbol = draft.symbol.toUpperCase().trim() || (isCash ? 'CASH' : isProperty ? (cat === 'REAL_ESTATE' ? 'HOME' : 'CAR') : 'NEW')
    const price = estimating ? estimate ?? 0 : parseFloat(draft.price) || 0
    // Cash / other / property: store the value as a single-unit position (qty 1,
    // price = value), no market pricing or auto-invest.
    const rawQty = entryBy === 'amount' ? computedShares : parseFloat(draft.quantity) || 0
    const quantity = isManual ? 1 : rawQty * unitToOz
    const prevClose = isManual ? price : draft.prevClose !== '' && !isNaN(parseFloat(draft.prevClose)) ? parseFloat(draft.prevClose) : price
    const autoAmt = !isManual && draft.autoOn && parseFloat(draft.autoAmount) > 0 ? parseFloat(draft.autoAmount) : null
    const cost = parseFloat(draft.openingCost)
    const hasCost = !isNaN(cost) && cost > 0 && (marketPriced || estimating)
    onSave({
      symbol,
      name: draft.name.trim() || (isMetal ? METALS.find((m) => m.symbol === symbol)?.name ?? symbol : symbol),
      category: cat,
      accountType: isProperty ? 'OTHER' : draft.accountType,
      institution: isProperty ? '' : draft.institution.trim(),
      quantity,
      price,
      prevClose,
      autoAmount: autoAmt,
      autoFrequency: autoAmt != null ? draft.autoFrequency : null,
      autoStartDate: autoAmt != null && draft.autoStartDate ? draft.autoStartDate : null,
      // Cost per unit is entered per display unit for metals — convert to per oz.
      openingCostPerShare: hasCost ? (isMetal ? cost / unitToOz : cost) : null,
      openingAcquiredAt: (marketPriced || estimating) && draft.openingDate ? draft.openingDate : null,
      providerId: cat === 'CRYPTO' ? draft.providerId : null,
      appreciationPct: estimating && !isNaN(rate) ? rate : null,
    })
  }

  const canSave = estimating ? estimate != null : true

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
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={isEdit ? 'Edit holding' : 'Add holding'}
        style={{
          width: 480,
          maxWidth: '100%',
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          background: '#16181F',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 20,
          padding: 24,
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontFamily: "'Space Grotesk'", fontSize: 19, fontWeight: 700 }}>
            {isEdit ? 'Edit holding' : 'Add holding'}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ width: 32, height: 32, borderRadius: 9, border: 'none', background: 'rgba(255,255,255,0.06)', color: '#8A90A2', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={field}>
            <label style={labelStyle}>Asset class</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {CATEGORIES.map((c) => {
                const selected = cat === c
                return (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    style={{
                      padding: '8px 2px',
                      borderRadius: 9,
                      border: '1px solid ' + (selected ? catColor(c) : 'rgba(255,255,255,0.1)'),
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                      fontFamily: 'inherit',
                      background: selected ? catColor(c) : 'transparent',
                      color: selected ? '#04140C' : '#8A90A2',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {CAT_LABEL[c]}
                  </button>
                )
              })}
            </div>
          </div>

          {!isProperty && (
            <>
              <div style={field}>
                <label style={labelStyle}>Account</label>
                <select value={draft.accountType} onChange={(e) => set('accountType', e.target.value as AccountType)} style={{ ...inputStyle, cursor: 'pointer' }}>
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

              <div style={field}>
                <label style={labelStyle}>Institution / brokerage</label>
                <input value={draft.institution} onChange={(e) => set('institution', e.target.value)} list="ff-institutions" placeholder={isMetal ? 'e.g. home safe, vault (optional)' : 'e.g. Charles Schwab (optional)'} style={inputStyle} />
                <datalist id="ff-institutions">
                  {INSTITUTIONS.map((i) => (
                    <option key={i} value={i} />
                  ))}
                </datalist>
              </div>
            </>
          )}

          {isMetal ? (
            <>
              <div style={field}>
                <label style={labelStyle}>Metal</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {METALS.map((m) => {
                    const sel = draft.symbol.toUpperCase() === m.symbol
                    return (
                      <button
                        key={m.symbol}
                        type="button"
                        onClick={() => pickMetal(m.symbol, m.name)}
                        style={{ padding: '8px 2px', borderRadius: 9, border: '1px solid ' + (sel ? '#E8C547' : 'rgba(255,255,255,0.1)'), background: sel ? 'rgba(232,197,71,0.16)' : 'transparent', color: sel ? '#E8C547' : '#8A90A2', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}
                      >
                        {m.name}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div style={field}>
                <label style={labelStyle}>Description</label>
                <input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. American Gold Eagles" style={inputStyle} />
              </div>
            </>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 12 }}>
              <div style={field}>
                <label style={labelStyle}>{isManual ? 'Label' : 'Ticker'}</label>
                {cat === 'CRYPTO' ? (
                  <CryptoPicker
                    value={draft.symbol}
                    providerId={draft.providerId}
                    onType={(text) => setDraft((d) => ({ ...d, symbol: text, providerId: null }))}
                    onPick={(c) => {
                      setDraft((d) => ({ ...d, symbol: c.symbol, name: c.name, providerId: c.id, price: '', prevClose: '' }))
                      fetchQuote(c.symbol, c.id, 'CRYPTO')
                    }}
                  />
                ) : (
                  <input
                    value={draft.symbol}
                    onChange={(e) => onTicker(e.target.value)}
                    onBlur={marketPriced ? syncQuote : undefined}
                    placeholder={isCash ? 'e.g. HYSA' : cat === 'OTHER' ? 'e.g. RSU' : cat === 'REAL_ESTATE' ? 'e.g. HOME' : cat === 'VEHICLE' ? 'e.g. CAR' : 'e.g. TSLA'}
                    style={{ ...inputStyle, fontWeight: 600, textTransform: 'uppercase' }}
                  />
                )}
              </div>
              <div style={field}>
                <label style={labelStyle}>{isManual ? 'Description' : 'Name'}</label>
                <input
                  value={draft.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder={isCash ? 'e.g. Ally Savings' : cat === 'REAL_ESTATE' ? 'e.g. 12 Maple St' : cat === 'VEHICLE' ? 'e.g. 2022 Toyota RAV4' : 'e.g. Tesla Inc'}
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          {isProperty && (
            <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.04)', padding: 3, borderRadius: 9 }}>
              {(['manual', 'estimate'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set('valueMode', m)}
                  style={{ flex: 1, padding: '6px 8px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', background: draft.valueMode === m ? 'rgba(34,227,138,0.16)' : 'transparent', color: draft.valueMode === m ? '#22E38A' : '#8A90A2' }}
                >
                  {m === 'manual' ? 'Enter current value' : `Estimate from purchase`}
                </button>
              ))}
            </div>
          )}

          {estimating ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={field}>
                  <label style={labelStyle}>Purchase price</label>
                  <MoneyInput value={draft.openingCost} onChange={(v) => set('openingCost', v)} prefix="$" placeholder="0" ariaLabel="Purchase price" />
                </div>
                <div style={field}>
                  <label style={labelStyle}>Purchase date</label>
                  <input type="date" value={draft.openingDate} onChange={(e) => set('openingDate', e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
                </div>
                <div style={{ ...field, gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>{cat === 'VEHICLE' ? 'Annual value change' : 'Annual appreciation'}</label>
                  <MoneyInput value={draft.appreciationPct} onChange={(v) => set('appreciationPct', v)} suffix="% / yr" ariaLabel="Annual appreciation" />
                  <span style={{ fontSize: 12, color: '#8A90A2' }}>
                    {cat === 'VEHICLE' ? 'Cars typically lose about 15% of their value a year — use a negative number.' : 'US home prices have risen roughly 3–5% a year over the long run.'}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 13, color: '#C9CDD8', background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px' }}>
                {estimate != null ? (
                  <>
                    Estimated value today: <b style={{ color: '#22E38A', fontFamily: "'Space Grotesk'" }}>{fmtUSD(estimate)}</b> — updates automatically.
                  </>
                ) : (
                  'Enter the purchase price, date and rate to estimate the value.'
                )}
              </div>
            </>
          ) : isManual ? (
            <div style={field}>
              <label style={labelStyle}>{isCash ? 'Cash balance' : 'Current value'}</label>
              <MoneyInput value={draft.price} onChange={(v) => set('price', v)} prefix="$" placeholder="0.00" ariaLabel="Current value" />
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div style={field}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <label style={labelStyle}>{entryBy === 'amount' ? 'Amount' : isMetal ? 'Weight' : 'Quantity'}</label>
                    {!isMetal && (
                      <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 7, padding: 2 }}>
                        {(['shares', 'amount'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setEntryBy(m)}
                            style={{ padding: '2px 7px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 700, fontFamily: 'inherit', background: entryBy === m ? '#22E38A' : 'transparent', color: entryBy === m ? '#04140C' : '#8A90A2' }}
                          >
                            {m === 'shares' ? 'Units' : '$'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {entryBy === 'amount' && !isMetal ? (
                    <MoneyInput value={amountInput} onChange={setAmountInput} prefix="$" placeholder="1000" ariaLabel="Amount" />
                  ) : (
                    <input value={draft.quantity} onChange={(e) => set('quantity', e.target.value)} type="number" step="any" inputMode="decimal" placeholder="0" style={inputStyle} />
                  )}
                </div>
                <div style={field}>
                  <label style={labelStyle}>{isMetal ? 'Price / oz' : 'Price'}</label>
                  <input value={draft.price} onChange={(e) => set('price', e.target.value)} type="number" step="any" inputMode="decimal" placeholder="0.00" style={inputStyle} />
                </div>
                <div style={field}>
                  <label style={labelStyle}>Prev close</label>
                  <input value={draft.prevClose} onChange={(e) => set('prevClose', e.target.value)} type="number" step="any" inputMode="decimal" placeholder="optional" style={inputStyle} />
                </div>
              </div>

              {isMetal && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: -6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#8A90A2' }}>Weight in</span>
                  {METAL_UNITS.map((u) => (
                    <button
                      key={u.value}
                      type="button"
                      onClick={() => set('metalUnit', u.value)}
                      style={{ padding: '3px 9px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', background: draft.metalUnit === u.value ? 'rgba(232,197,71,0.18)' : 'rgba(255,255,255,0.05)', color: draft.metalUnit === u.value ? '#E8C547' : '#8A90A2' }}
                    >
                      {u.label}
                    </button>
                  ))}
                  {draft.metalUnit !== 'oz' && parseFloat(draft.quantity) > 0 && (
                    <span style={{ fontSize: 12, color: '#C9CDD8' }}>= {(parseFloat(draft.quantity) * unitToOz).toLocaleString('en-US', { maximumFractionDigits: 3 })} troy oz</span>
                  )}
                </div>
              )}

              {entryBy === 'amount' && !isMetal && (
                <div style={{ fontSize: 12, color: '#8A90A2', marginTop: -4 }}>
                  {priceNum > 0 ? (
                    <>≈ <b style={{ color: '#22E38A' }}>{computedShares.toLocaleString('en-US', { maximumFractionDigits: 6 })}</b> units at ${priceNum.toLocaleString('en-US', { maximumFractionDigits: 8 })} each</>
                  ) : (
                    'Enter a price first to convert the amount into units.'
                  )}
                </div>
              )}
            </>
          )}

          {marketPriced ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: -4, minHeight: 18, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={syncQuote}
                disabled={syncing || !draft.symbol.trim()}
                style={{ border: 'none', background: 'transparent', color: syncing || !draft.symbol.trim() ? '#5B6172' : '#22E38A', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: syncing || !draft.symbol.trim() ? 'default' : 'pointer', padding: 0 }}
              >
                {syncing ? 'Fetching…' : '↻ Fetch live price'}
              </button>
              {syncMsg && <span style={{ fontSize: 12, color: '#8A90A2' }}>{syncMsg}</span>}
            </div>
          ) : (
            !estimating && (
              <div style={{ fontSize: 12, color: '#8A90A2', marginTop: -4 }}>
                {isCash ? 'Cash is tracked at its balance — no market price needed.' : 'Manual entry — tracked at the value you enter.'}
                {isProperty && ' Link a mortgage or loan to it from the Debts section to see your equity.'}
              </div>
            )
          )}

          {/* Cost basis — powers gains, tax-lot and harvesting insights */}
          {marketPriced && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={field}>
                  <label style={labelStyle}>Avg cost / {isMetal ? METAL_UNITS.find((u) => u.value === draft.metalUnit)!.value : 'unit'}</label>
                  <MoneyInput value={draft.openingCost} onChange={(v) => set('openingCost', v)} prefix="$" placeholder="optional" ariaLabel="Average cost" />
                </div>
                <div style={field}>
                  <label style={labelStyle}>{dup ? 'Bought on' : 'Acquired (approx.)'}</label>
                  <input type="date" value={draft.openingDate} onChange={(e) => set('openingDate', e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
                </div>
              </div>
              <span style={{ fontSize: 12, color: '#8A90A2', lineHeight: 1.45 }}>
                {dup
                  ? `These ${unitLabel} are logged as a buy at this cost and date (defaults: today's price, today).`
                  : isEdit && openingQty != null && Math.abs(openingQty - (editing?.quantity ?? 0)) > 1e-9
                    ? `Applies to the ${openingQty.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${unitLabel} held before your logged buys — those carry their own cost.`
                    : 'What you paid on average (see your brokerage’s cost basis). Used for gains and tax-loss harvesting; buys and sells you log later are tracked separately.'}
              </span>
            </div>
          )}

          {/* Auto-invest (recurring DCA) — not for cash/manual positions */}
          {!isManual && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={draft.autoOn} onChange={(e) => set('autoOn', e.target.checked)} style={{ accentColor: '#22E38A', width: 16, height: 16 }} />
                <span style={{ fontSize: 13, fontWeight: 700 }}>Auto-invest on a schedule</span>
              </label>

              {draft.autoOn && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 12 }}>
                    <div style={field}>
                      <label style={labelStyle}>Amount</label>
                      <MoneyInput value={draft.autoAmount} onChange={(v) => set('autoAmount', v)} prefix="$" placeholder="500" ariaLabel="Auto-invest amount" />
                    </div>
                    <div style={field}>
                      <label style={labelStyle}>Frequency</label>
                      <select value={draft.autoFrequency} onChange={(e) => set('autoFrequency', e.target.value as AutoFrequency)} style={{ ...inputStyle, cursor: 'pointer' }}>
                        {AUTO_FREQUENCIES.map((f) => (
                          <option key={f.value} value={f.value} style={{ background: '#16181F' }}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ ...field, gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>{isEdit ? 'Next contribution date' : 'Start date'}</label>
                      <input type="date" value={draft.autoStartDate} onChange={(e) => set('autoStartDate', e.target.value)} style={{ ...inputStyle, cursor: 'pointer', colorScheme: 'dark' }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: '#8A90A2' }}>
                    Adds <b style={{ color: '#22E38A' }}>${draft.autoAmount || '0'}</b> of {draft.symbol.toUpperCase() || 'this holding'}{' '}
                    {AUTO_FREQUENCIES.find((f) => f.value === draft.autoFrequency)?.label.toLowerCase()}
                    {draft.autoStartDate ? `, starting ${draft.autoStartDate}` : ' (starting next period)'}, at that day's price.
                  </span>
                </>
              )}
            </div>
          )}

          {dup && (
            <div style={{ background: 'rgba(255,176,32,0.08)', border: '1px solid rgba(255,176,32,0.3)', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, color: '#F2C879', lineHeight: 1.45 }}>
              You already hold <b>{dup.symbol}</b> ({dup.quantity}) in your{' '}
              <b>{ACCOUNT_TYPES.find((a) => a.value === dup.accountType)?.short}</b>
              {dup.institution ? <> account at <b>{dup.institution}</b></> : ' account'}. Saving will <b>combine</b> them into{' '}
              <b>{(dup.quantity + (isManual ? 1 : addQty)).toLocaleString('en-US', { maximumFractionDigits: 6 })}</b> — the existing position won't be replaced.
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
            {isEdit && (
              <button
                onClick={() => editing && onDelete(editing)}
                style={{ padding: '11px 16px', borderRadius: 10, border: '1px solid rgba(255,84,112,0.35)', background: 'rgba(255,84,112,0.1)', color: '#FF5470', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}
              >
                Delete
              </button>
            )}
            {isEdit && !isManual && onTransact && editing && (
              <button
                onClick={() => onTransact(editing)}
                style={{ padding: '11px 16px', borderRadius: 10, border: '1px solid rgba(53,160,255,0.35)', background: 'rgba(53,160,255,0.12)', color: '#35A0FF', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}
              >
                Buy / Sell
              </button>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
              <button
                onClick={onClose}
                style={{ padding: '11px 18px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#C9CDD8', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={!canSave}
                style={{ padding: '11px 20px', borderRadius: 10, border: 'none', background: canSave ? '#22E38A' : '#3A3F4C', color: '#04140C', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: canSave ? 'pointer' : 'default' }}
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
