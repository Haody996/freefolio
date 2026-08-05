import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { fmtUSD, accountLabel } from '../../lib/portfolio'
import type { Holding } from '../../lib/portfolio'

interface Tx {
  id: string
  type: 'BUY' | 'SELL'
  quantity: number
  price: number
  amount: number
  date: string
  affectedCash: boolean
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  padding: '10px 11px',
  color: '#F2F4F8',
  fontFamily: 'inherit',
  fontSize: 14,
  fontVariantNumeric: 'tabular-nums',
}
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: 0.4, color: '#8A90A2', textTransform: 'uppercase' }

export default function TransactionModal({
  holding,
  cashHoldings,
  onClose,
}: {
  holding: Holding
  cashHoldings: Holding[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [type, setType] = useState<'BUY' | 'SELL'>('BUY')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState(String(holding.price || ''))
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [affectCash, setAffectCash] = useState(false) // default: buy → no
  const [cashTarget, setCashTarget] = useState('AUTO')

  // Sell defaults: use today's price + add proceeds to cash. Buy: don't touch cash.
  useEffect(() => {
    if (type === 'SELL') {
      setAffectCash(true)
      setPrice(String(holding.price || ''))
    } else {
      setAffectCash(false)
    }
  }, [type, holding.price])

  // Prefer a cash account matching this holding's account + brokerage.
  useEffect(() => {
    const match = cashHoldings.find((c) => c.accountType === holding.accountType && (c.institution || '') === (holding.institution || ''))
    setCashTarget(match ? match.id : 'AUTO')
  }, [cashHoldings, holding.accountType, holding.institution])

  const history = useQuery<{ transactions: Tx[] }>({
    queryKey: ['transactions', holding.id],
    queryFn: async () => (await api.get(`/transactions?holdingId=${holding.id}`)).data,
  })

  const submit = useMutation({
    mutationFn: async () =>
      (await api.post('/transactions', {
        holdingId: holding.id,
        type,
        quantity: parseFloat(quantity) || 0,
        price: parseFloat(price) || 0,
        date,
        affectCash,
        cashHoldingId: affectCash && cashTarget !== 'AUTO' ? cashTarget : null,
      })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holdings'] })
      qc.invalidateQueries({ queryKey: ['networth'] })
      qc.invalidateQueries({ queryKey: ['transactions', holding.id] })
      setQuantity('')
    },
  })

  const qty = parseFloat(quantity) || 0
  const px = parseFloat(price) || 0
  const amount = qty * px
  const isBuy = type === 'BUY'

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(6,7,10,0.65)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 480, maxWidth: '100%', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', background: '#16181F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 26, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontFamily: "'Space Grotesk'", fontSize: 19, fontWeight: 700 }}>Log transaction</div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, border: 'none', background: 'rgba(255,255,255,0.06)', color: '#8A90A2', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ fontSize: 13, color: '#8A90A2', marginBottom: 18 }}>
          {holding.symbol} · {accountLabel(holding.accountType)}{holding.institution ? ` · ${holding.institution}` : ''} · you hold {holding.quantity}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Buy / Sell */}
          <div style={{ display: 'flex', gap: 8 }}>
            {(['BUY', 'SELL'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: '1px solid ' + (type === t ? (t === 'BUY' ? '#22E38A' : '#FF5470') : 'rgba(255,255,255,0.1)'), cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', background: type === t ? (t === 'BUY' ? '#22E38A' : '#FF5470') : 'transparent', color: type === t ? (t === 'BUY' ? '#04140C' : '#fff') : '#8A90A2' }}
              >
                {t === 'BUY' ? 'Buy' : 'Sell'}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={labelStyle}>Shares</label>
              <input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" step="any" placeholder="0" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={labelStyle}>Price</label>
              <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" step="any" placeholder="0.00" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={labelStyle}>Date</label>
              <input value={date} onChange={(e) => setDate(e.target.value)} type="date" style={{ ...inputStyle, colorScheme: 'dark' }} />
            </div>
          </div>

          <div style={{ fontSize: 13, color: '#C9CDD8' }}>
            {isBuy ? 'Buy' : 'Sell'} <b>{qty || 0}</b> {holding.symbol} @ ${px.toLocaleString('en-US', { maximumFractionDigits: 2 })} ={' '}
            <b style={{ color: isBuy ? '#FF5470' : '#22E38A' }}>{isBuy ? '−' : '+'}{fmtUSD(Math.round(amount))}</b>
            {type === 'SELL' && <span style={{ color: '#8A90A2' }}> · price defaults to today's</span>}
          </div>

          {/* Cash effect */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={affectCash} onChange={(e) => setAffectCash(e.target.checked)} style={{ accentColor: '#22E38A', width: 16, height: 16 }} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>{isBuy ? 'Deduct cost from cash' : 'Add proceeds to cash'}</span>
            </label>
            {affectCash && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={labelStyle}>Cash account</label>
                <select value={cashTarget} onChange={(e) => setCashTarget(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="AUTO" style={{ background: '#16181F' }}>Auto — same account (create if needed)</option>
                  {cashHoldings.map((c) => (
                    <option key={c.id} value={c.id} style={{ background: '#16181F' }}>
                      {c.name || c.symbol} · {accountLabel(c.accountType)}{c.institution ? ` · ${c.institution}` : ''} ({fmtUSD(Math.round(c.price))})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button onClick={onClose} style={{ padding: '11px 18px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#C9CDD8', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>Close</button>
            <button
              onClick={() => submit.mutate()}
              disabled={submit.isPending || qty <= 0}
              style={{ padding: '11px 20px', borderRadius: 10, border: 'none', background: qty > 0 ? (isBuy ? '#22E38A' : '#FF5470') : '#3A3F4C', color: isBuy ? '#04140C' : '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: qty > 0 ? 'pointer' : 'default' }}
            >
              {submit.isPending ? 'Saving…' : isBuy ? 'Log buy' : 'Log sell'}
            </button>
          </div>

          {/* History */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14 }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>History</div>
            {history.data && history.data.transactions.length > 0 ? (
              <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {history.data.transactions.map((t) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                    <span>
                      <b style={{ color: t.type === 'BUY' ? '#22E38A' : '#FF5470' }}>{t.type === 'BUY' ? 'Buy' : 'Sell'}</b> {t.quantity} @ ${t.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      {t.affectedCash && <span style={{ color: '#35A0FF', fontSize: 11 }}> · cash</span>}
                    </span>
                    <span style={{ color: '#8A90A2' }}>{new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#8A90A2' }}>No transactions logged yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
